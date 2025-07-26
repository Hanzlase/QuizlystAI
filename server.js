require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { YoutubeTranscript } = require('youtube-transcript');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();

// Check if running in Vercel environment
const isVercel = process.env.VERCEL === '1';

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Add request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Add error handling middleware for JSON parsing
app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
        console.error('JSON Parse Error:', error.message);
        return res.status(400).json({ message: 'Invalid JSON in request body' });
    }
    next();
});

// Configure multer for file uploads (disabled in Vercel)
let upload;
if (!isVercel) {
  upload = multer({
    dest: 'uploads/',
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (_, file, cb) => {
      const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only PDF, DOCX, and TXT files are allowed.'));
      }
    }
  });
} else {
  console.log('File uploads disabled in Vercel environment');
}

// Store the last processed content in memory for quiz generation
let lastProcessedContent = null;

// Helper function to extract content from different sources (OPTIMIZED)
const extractContent = async (url, type) => {
    try {
        console.log(`🔍 Starting content extraction for ${type}: ${url}`);

        if (type === 'youtube' || url.includes('youtube.com') || url.includes('youtu.be')) {
            console.log('📺 Extracting YouTube transcript...');
            console.log('📺 YouTube URL:', url);

            // Normalize YouTube URL first
            const normalizedUrl = normalizeYouTubeUrl(url);
            console.log('📺 Normalized URL:', normalizedUrl);

            // Extract video ID for validation
            const videoId = extractVideoId(normalizedUrl);
            if (!videoId) {
                throw new Error('Invalid YouTube URL: Could not extract video ID');
            }
            console.log('📺 Video ID:', videoId);

            try {
                // Extract YouTube video transcript with timeout
                const transcript = await Promise.race([
                    YoutubeTranscript.fetchTranscript(normalizedUrl),
                    new Promise((_, reject) =>
                        setTimeout(() => reject(new Error('YouTube extraction timeout after 15 seconds')), 15000)
                    )
                ]);

                console.log('📺 Transcript extracted successfully, items:', transcript.length);

                if (!transcript || transcript.length === 0) {
                    throw new Error('No transcript available for this video. The video may not have captions enabled.');
                }

                let content = transcript.map(item => item.text).join(' ');
                console.log('📺 Raw transcript length:', content.length);

                // Validate that we got actual video content, not generic YouTube content
                if (content.toLowerCase().includes('youtube is a global platform') ||
                    content.toLowerCase().includes('youtube company') ||
                    content.toLowerCase().includes('about youtube') ||
                    content.length < 100) {
                    console.log('📺 Detected generic YouTube content, trying alternative extraction...');
                    throw new Error('Generic YouTube content detected');
                }

                // Limit YouTube content for faster processing
                if (content.length > 5000) {
                    content = content.substring(0, 5000) + '...';
                    console.log(`📺 YouTube content truncated to 5000 characters`);
                }

                if (content.length < 50) {
                    throw new Error('Extracted transcript is too short. The video may not have meaningful captions.');
                }

                return content;
            } catch (youtubeError) {
                console.error('📺 YouTube extraction failed:', youtubeError.message);

                // Enhanced fallback method with video-specific extraction
                console.log('📺 Attempting enhanced fallback: extracting video-specific metadata...');
                try {
                    // Add random delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));

                    // Fetch video page directly with better headers
                    const videoPageResponse = await axios.get(normalizedUrl, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                            'Accept-Language': 'en-US,en;q=0.5',
                            'Accept-Encoding': 'gzip, deflate',
                            'Connection': 'keep-alive',
                            'Upgrade-Insecure-Requests': '1'
                        },
                        timeout: 10000
                    });

                    const $ = cheerio.load(videoPageResponse.data);

                    // Extract video-specific metadata with better validation
                    let title = $('meta[property="og:title"]').attr('content') ||
                               $('meta[name="title"]').attr('content') ||
                               $('title').text().replace(' - YouTube', '') || '';

                    let description = $('meta[property="og:description"]').attr('content') ||
                                    $('meta[name="description"]').attr('content') || '';

                    // Validate that we're not getting generic YouTube content
                    if (title.toLowerCase().includes('youtube') && title.length < 20) {
                        title = ''; // Reset generic title
                    }
                    if (description.toLowerCase().includes('youtube is a global platform') ||
                        description.toLowerCase().includes('enjoy the videos and music you love')) {
                        description = ''; // Reset generic description
                    }

                    console.log('📺 Extracted title:', title);
                    console.log('📺 Extracted description length:', description.length);

                    // Try to extract from ytInitialData (YouTube's data structure)
                    const pageContent = videoPageResponse.data;
                    const ytDataMatch = pageContent.match(/var ytInitialData = ({.*?});/);
                    let ytDescription = '';
                    if (ytDataMatch) {
                        try {
                            const ytData = JSON.parse(ytDataMatch[1]);
                            const videoDetails = ytData?.contents?.twoColumnWatchNextResults?.results?.results?.contents?.[0]?.videoPrimaryInfoRenderer;
                            if (videoDetails?.title?.runs?.[0]?.text) {
                                title = videoDetails.title.runs[0].text;
                            }

                            const videoSecondary = ytData?.contents?.twoColumnWatchNextResults?.results?.results?.contents?.[1]?.videoSecondaryInfoRenderer;
                            if (videoSecondary?.description?.runs) {
                                ytDescription = videoSecondary.description.runs.map(run => run.text).join('');
                            }
                        } catch (parseError) {
                            console.log('📺 Could not parse ytInitialData, continuing with basic extraction...');
                        }
                    }

                    // Use the best available description
                    if (ytDescription && ytDescription.length > description.length) {
                        description = ytDescription;
                    }

                    // Combine title and description for content
                    let fallbackContent = '';
                    if (title && title.trim()) {
                        fallbackContent += `Title: ${title.trim()}\n\n`;
                    }
                    if (description && description.trim()) {
                        fallbackContent += `Description: ${description.trim()}`;
                    }

                    // Final validation
                    if (!fallbackContent || fallbackContent.length < 50) {
                        throw new Error('Could not extract meaningful content from video metadata');
                    }

                    // Validate it's not generic content
                    if (fallbackContent.toLowerCase().includes('youtube is a global platform') ||
                        fallbackContent.toLowerCase().includes('youtube company')) {
                        throw new Error('Only generic YouTube content available');
                    }

                    console.log('📺 Fallback extraction successful, content length:', fallbackContent.length);
                    return fallbackContent;

                } catch (fallbackError) {
                    console.error('📺 Fallback extraction also failed:', fallbackError.message);

                    // Provide specific error messages based on the type of failure
                    if (youtubeError.message.includes('Transcript is disabled') ||
                        youtubeError.message.includes('No transcript available')) {
                        throw new Error('This YouTube video does not have captions/subtitles available. Please try a different video.');
                    } else if (youtubeError.message.includes('Video unavailable') ||
                               youtubeError.message.includes('private')) {
                        throw new Error('This YouTube video is unavailable, private, or restricted. Please check the URL and try again with a public video.');
                    } else if (youtubeError.message.includes('Video ID')) {
                        throw new Error('Invalid YouTube URL format. Please use a valid YouTube video URL.');
                    } else {
                        throw new Error(`YouTube processing failed: ${youtubeError.message}. Please ensure the video has captions/subtitles enabled.`);
                    }
                }
            }


        } else {
            console.log('🌐 Extracting web page content...');
            // Extract content from regular web page with timeout
            const response = await Promise.race([
                axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 10000 // 10 second timeout
                }),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Web page extraction timeout')), 12000)
                )
            ]);

            const $ = cheerio.load(response.data);

            // Remove script and style elements
            $('script, style, nav, header, footer, aside, .advertisement, .ads').remove();

            // Extract main content with priority selectors
            let content = '';
            const contentSelectors = [
                'main article', 'article', 'main',
                '.content', '#content', '.post-content',
                '.entry-content', '.article-content', 'p'
            ];

            for (const selector of contentSelectors) {
                const element = $(selector);
                if (element.length && element.text().trim().length > 200) {
                    content = element.text().trim();
                    break;
                }
            }

            // Fallback to body content if no main content found
            if (!content) {
                content = $('body').text().trim();
            }

            // Clean up the content aggressively
            content = content
                .replace(/\s+/g, ' ')
                .replace(/\n+/g, ' ')
                .replace(/\t+/g, ' ')
                .trim();

            // Increased content length for detailed learning
            if (content.length > 10000) {
                content = content.substring(0, 10000) + '...';
                console.log(`🌐 Web content truncated to 10000 characters`);
            }

            return content;
        }
    } catch (error) {
        console.error('Content extraction error:', error.message);
        throw new Error(`Failed to extract content: ${error.message}`);
    }
};

// Helper function to normalize YouTube URLs
function normalizeYouTubeUrl(url) {
    try {
        // Handle different YouTube URL formats
        if (url.includes('youtu.be/')) {
            const videoId = url.split('youtu.be/')[1].split('?')[0].split('&')[0];
            return `https://www.youtube.com/watch?v=${videoId}`;
        } else if (url.includes('youtube.com/watch')) {
            // Already in correct format, but clean up parameters
            const urlObj = new URL(url);
            const videoId = urlObj.searchParams.get('v');
            if (videoId) {
                return `https://www.youtube.com/watch?v=${videoId}`;
            }
        } else if (url.includes('youtube.com/embed/')) {
            const videoId = url.split('/embed/')[1].split('?')[0];
            return `https://www.youtube.com/watch?v=${videoId}`;
        }
        return url;
    } catch (error) {
        console.error('URL normalization failed:', error);
        return url;
    }
}

// Helper function to extract video ID from YouTube URL
function extractVideoId(url) {
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('youtube.com')) {
            return urlObj.searchParams.get('v');
        } else if (urlObj.hostname.includes('youtu.be')) {
            return urlObj.pathname.slice(1);
        }
        return null;
    } catch (error) {
        console.error('Video ID extraction failed:', error);
        return null;
    }
}

// Helper function to extract text from uploaded files using buffer (for production)
const extractFileContentFromBuffer = async (file) => {
    try {
        let content = '';

        if (file.mimetype === 'application/pdf') {
            // Extract text from PDF buffer
            const pdfData = await pdfParse(file.buffer);
            content = pdfData.text;
        } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            // Extract text from DOCX buffer
            const docxData = await mammoth.extractRawText({ buffer: file.buffer });
            content = docxData.value;
        } else if (file.mimetype === 'text/plain') {
            // Extract text from TXT buffer
            content = file.buffer.toString('utf-8');
        } else {
            throw new Error('Unsupported file type');
        }

        // Clean and validate content
        content = content.trim();
        if (!content || content.length < 10) {
            throw new Error('File appears to be empty or contains insufficient text');
        }

        console.log(`📄 Successfully extracted ${content.length} characters from ${file.originalname}`);
        return content;

    } catch (error) {
        console.error('File content extraction error:', error);
        throw new Error(`Failed to extract content from file: ${error.message}`);
    }
};

// Helper function to extract text from uploaded files (OPTIMIZED)
const extractFileContent = async (file) => {
    try {
        console.log(`📁 Extracting content from ${file.originalname} (${file.mimetype})`);
        const filePath = file.path;
        let content = '';

        // Add timeout for file processing
        const extractionPromise = (async () => {
            if (file.mimetype === 'application/pdf') {
                console.log('📄 Processing PDF...');
                const dataBuffer = fs.readFileSync(filePath);
                const data = await pdfParse(dataBuffer);
                content = data.text;
            } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
                console.log('📝 Processing DOCX...');
                const result = await mammoth.extractRawText({ path: filePath });
                content = result.value;
            } else if (file.mimetype === 'text/plain') {
                console.log('📃 Processing TXT...');
                content = fs.readFileSync(filePath, 'utf8');
            }
            return content;
        })();

        // Race against timeout
        content = await Promise.race([
            extractionPromise,
            new Promise((_, reject) =>
                setTimeout(() => reject(new Error('File processing timeout')), 20000)
            )
        ]);

        // Clean up the file
        try {
            fs.unlinkSync(filePath);
        } catch (err) {
            console.warn('Could not delete temp file:', err.message);
        }

        // Clean and limit content length for faster processing
        content = content
            .replace(/\s+/g, ' ')
            .replace(/\n+/g, ' ')
            .trim();

        if (content.length > 10000) {
            content = content.substring(0, 10000) + '...';
            console.log(`📁 File content truncated to 10000 characters`);
        }

        return content;
    } catch (error) {
        console.error('File extraction error:', error.message);
        // Clean up file on error
        try {
            fs.unlinkSync(file.path);
        } catch (err) {
            // Ignore cleanup errors
        }
        throw new Error(`Failed to extract content from file: ${error.message}`);
    }
};

// Helper function to call AI API with dual API support
const callAIApi = async (prompt, instructions = '', timeout = 60000) => { // 60 second timeout
    // Check if primary API key is available
    if (!process.env.API_KEY) {
        throw new Error('API_KEY environment variable is not set');
    }

    // Primary model (OpenRouter) and fallback model (Cohere)
    const modelConfigs = [
        {
            model: "deepseek/deepseek-chat-v3-0324:free",
            apiKey: process.env.API_KEY,
            endpoint: "https://openrouter.ai/api/v1/chat/completions",
            provider: "OpenRouter"
        },
        {
            model: "command-r-plus",
            apiKey: process.env.COHERE_KEY,
            endpoint: "https://api.cohere.ai/v1/chat",
            provider: "Cohere"
        }
    ];

    for (let i = 0; i < modelConfigs.length; i++) {
        const config = modelConfigs[i];
        try {
            // Use full timeout for both models
            const modelTimeout = timeout;
            console.log(`🤖 Trying ${config.provider}: ${config.model} (timeout: ${modelTimeout}ms)...`);

            let apiCall;

            if (config.provider === "OpenRouter") {
                // OpenRouter API call
                apiCall = axios.post(config.endpoint, {
                    model: config.model,
                    messages: [
                        { role: "system", content: instructions || "You are a helpful learning assistant. Be concise and clear." },
                        { role: "user", content: prompt }
                    ],
                    temperature: 0.4, // Balanced temperature for quality responses
                    // max_tokens removed to allow full responses
                    top_p: 0.9,       // Higher for better quality
                    stream: false     // Ensure no streaming for consistent timing
                }, {
                    headers: {
                        'Authorization': `Bearer ${config.apiKey}`,
                        'Content-Type': 'application/json',
                        'HTTP-Referer': 'http://localhost:5000',
                        'X-Title': 'Quizlyst AI'
                    },
                    timeout: modelTimeout - 1000 // Reduced buffer time
                });
            } else if (config.provider === "Cohere") {
                // Cohere API call
                apiCall = axios.post(config.endpoint, {
                    model: config.model,
                    message: prompt,
                    preamble: instructions || "You are a helpful learning assistant. Be concise and clear.",
                    temperature: 0.4,    // Balanced temperature for quality
                    // max_tokens removed to allow full responses
                    p: 0.9,             // Higher for better quality
                    stream: false       // No streaming
                }, {
                    headers: {
                        'Authorization': `Bearer ${config.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: modelTimeout - 1000 // Reduced buffer
                });
            }

            const response = await Promise.race([
                apiCall,
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('AI API timeout')), modelTimeout)
                )
            ]);

            console.log(`✅ AI API response received from ${config.provider} (${config.model})`);

            // Handle different response formats
            if (config.provider === "OpenRouter") {
                return response.data.choices[0].message.content;
            } else if (config.provider === "Cohere") {
                return response.data.text;
            }

        } catch (error) {
            console.error(`❌ ${config.provider} (${config.model}) failed:`, error.response?.data?.error?.message || error.message);

            // Log more details for debugging
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
            }

            // If this is the last model, throw the error
            if (i === modelConfigs.length - 1) {
                if (error.message.includes('timeout')) {
                    throw new Error('AI processing is taking too long. Please try with shorter content.');
                }
                if (error.response?.status === 401) {
                    throw new Error('API authentication failed. Please check your API keys.');
                }
                if (error.response?.status === 429) {
                    throw new Error('API rate limit exceeded. Please try again later.');
                }
                if (error.response?.status === 503) {
                    throw new Error('AI model is currently overloaded. Please try again in a few minutes.');
                }
                throw new Error(`All AI models are currently unavailable: ${error.message}`);
            }

            // Otherwise, continue to next model
            console.log(`🔄 Trying fallback model...`);
        }
    }
};

// Routes

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        environment: isVercel ? 'vercel' : 'local',
        hasApiKey: !!process.env.API_KEY,
        nodeVersion: process.version
    });
});

// Content Processing Endpoints
app.post('/api/content/process', async (req, res) => {
    try {
        const { url, type, mode = 'simple', customPrompt } = req.body;

        if (!url) {
            return res.status(400).json({ message: 'URL is required' });
        }

        console.log(`🔄 Processing ${type || 'link'}: ${url}`);

        // Extract actual content from the URL
        const extractedContent = await extractContent(url, type);

        if (!extractedContent || extractedContent.length < 50) {
            return res.status(400).json({ message: 'Could not extract meaningful content from the provided URL' });
        }

        console.log(`📄 Extracted content length: ${extractedContent.length} characters`);

        // Prepare AI prompt for DETAILED learning notes with proper formatting
        let notesPrompt;
        if (mode === 'custom' && customPrompt) {
            notesPrompt = `I have extracted content from the provided URL. Here is the complete content:

EXTRACTED CONTENT:
${extractedContent}

USER'S CUSTOM INSTRUCTIONS:
${customPrompt}

Please analyze the above content and create detailed notes following the user's specific instructions. Use proper markdown formatting with headers, bullet points, and clear structure. Focus on the content provided above.`;
        } else {
            notesPrompt = `Create exceptionally comprehensive and detailed study notes from the following content. Analyze every aspect thoroughly and extract maximum educational value:

CONTENT TO ANALYZE:
${extractedContent}

ADVANCED FORMATTING REQUIREMENTS:
- Use ## for main topics/sections with descriptive, informative titles
- Use ### for subtopics and detailed subsections
- Use * for bullet points with comprehensive explanations
- Use **bold** for key terms, critical concepts, and essential information
- Use *italics* for emphasis on important insights and connections
- Use clear line breaks and proper spacing for excellent readability
- Create hierarchical structure that flows logically from general to specific

COMPREHENSIVE CONTENT REQUIREMENTS:
- Extract and explain ALL key concepts, facts, and information in detail
- Provide thorough background context and clear definitions for technical terms
- Include specific examples, case studies, and practical applications mentioned
- Explain the "why" and "how" behind concepts, not just the "what"
- Identify and highlight cause-and-effect relationships and connections
- Include all important details, statistics, dates, figures, and specific data
- Add explanatory context where concepts might be complex or unclear
- Make connections between different ideas and concepts when applicable
- Ensure comprehensive coverage that leaves no important information out
- Create notes detailed enough for complete mastery of the subject matter
- Organize information in a logical, educational sequence that builds understanding

Create exceptionally detailed, comprehensive, and well-structured notes that would enable someone to achieve complete understanding and mastery of this content. Prioritize depth, clarity, and educational thoroughness.

IMPORTANT: Write ONLY the study notes content. Do not include any introductory phrases like "Here are the study notes" or concluding statements like "These notes cover..." - provide only the direct educational content formatted in markdown.`;
        }

        console.log(`🤖 Generating detailed notes (${mode} mode)...`);

        // Generate detailed notes using AI
        const systemPrompt = mode === 'custom' && customPrompt
            ? "You are a world-class educator, content analyst, and learning specialist with expertise in creating exceptional educational materials. The user has provided you with extracted content and specific instructions. Your task is to create the most comprehensive, detailed, and educationally valuable notes possible based on the provided content, following the user's instructions exactly. Use advanced markdown formatting techniques and ensure maximum educational impact. Do not ask for additional content - work with what has been provided and extract every bit of educational value from it."
            : "You are a world-class educator and learning specialist with expertise in creating exceptional study materials. Your mission is to generate the most comprehensive, detailed, and well-structured notes possible. You excel at breaking down complex information into clear, understandable segments while maintaining depth and thoroughness. Use advanced markdown formatting with ## for main headings, ### for subheadings, * for detailed bullet points, **bold** for critical terms and concepts, *italics* for emphasis, and perfect spacing. Create educational content that is both comprehensive and highly readable, ensuring students can achieve complete mastery of the subject matter. Write only the study notes content without any introductory or concluding meta-commentary.";

        const aiResponse = await callAIApi(
            notesPrompt,
            systemPrompt,
            60000 // 60 second timeout for notes
        );

        console.log(`📝 Notes generated, creating summary...`);

        // Generate comprehensive summary
        const summary = await callAIApi(
            `Based on the following detailed study notes, create a comprehensive yet concise summary:

STUDY NOTES TO SUMMARIZE:
${aiResponse}

Requirements:
- Capture all major topics and key concepts covered
- Highlight the most important facts and insights
- Maintain logical flow and connections between ideas
- Use clear, engaging language that reinforces learning
- Provide a complete overview that serves as a quick review
- Be comprehensive enough to remind someone of all main points

Write ONLY the summary content as 3-4 well-crafted sentences. Do not include any introductory phrases like "Here's a summary" or concluding statements like "This summary captures..." - provide only the direct summary content.`,
            "You are an expert at creating comprehensive yet concise summaries. Write only the summary content without any meta-commentary, introductory phrases, or concluding statements. Provide direct, substantive summary content that captures the essence and key points of educational material.",
            60000 // 60 second timeout for summary
        );

        // Store content in memory for quiz generation
        lastProcessedContent = {
            type: type || 'link',
            url,
            notes: aiResponse.split('\n').filter(n => n.trim()),
            summary,
            processedAt: new Date(),
            quizzes: []
        };

        console.log(`✅ Content processed successfully`);

        res.json({
            notes: lastProcessedContent.notes,
            summary: lastProcessedContent.summary,
            contentLength: extractedContent.length
        });
    } catch (error) {
        console.error('Content processing error:', error);
        res.status(500).json({ message: error.message || 'Failed to process content' });
    }
});

// Universal file upload endpoint that works in both local and production environments
app.post('/api/content/upload', async (req, res) => {
  try {
    const { mode = 'simple', customPrompt, fileData, fileName, fileType } = req.body;

    let file;
    let extractedContent;

    if (isVercel) {
      // Production environment - handle base64 file data
      if (!fileData || !fileName || !fileType) {
        return res.status(400).json({ message: 'File data, name, and type are required for production uploads' });
      }

      console.log(`📁 Processing uploaded file (production): ${fileName}`);

      // Validate file type
      const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
      if (!allowedTypes.includes(fileType)) {
        return res.status(400).json({ message: 'Invalid file type. Only PDF, DOCX, and TXT files are allowed.' });
      }

      // Convert base64 to buffer
      const fileBuffer = Buffer.from(fileData, 'base64');

      // Create file object for processing
      file = {
        originalname: fileName,
        mimetype: fileType,
        buffer: fileBuffer,
        size: fileBuffer.length
      };

      // Check file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        return res.status(400).json({ message: 'File size exceeds 10MB limit' });
      }

      extractedContent = await extractFileContentFromBuffer(file);
    } else {
      // Local environment - handle traditional multer upload
      const multerUpload = upload.single('file');

      await new Promise((resolve, reject) => {
        multerUpload(req, res, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      file = req.file;
      if (!file) {
        return res.status(400).json({ message: 'File is required' });
      }

      console.log(`📁 Processing uploaded file (local): ${file.originalname}`);
      extractedContent = await extractFileContent(file);
    }

    if (!extractedContent || extractedContent.length < 50) {
      return res.status(400).json({ message: 'Could not extract meaningful content from the uploaded file' });
    }

    console.log(`📄 Extracted file content length: ${extractedContent.length} characters`);

    // Prepare AI prompt based on mode
    let notesPrompt;
    if (mode === 'custom' && customPrompt) {
      notesPrompt = `I have extracted the text content from the uploaded file "${file.originalname}". Here is the complete content:

DOCUMENT CONTENT:
${extractedContent}

USER'S CUSTOM INSTRUCTIONS:
${customPrompt}

Please analyze the above document content and create detailed notes following the user's specific instructions. Use proper markdown formatting with headers, bullet points, and clear structure. Focus on the content provided above, not on requesting additional files.`;
    } else {
      notesPrompt = `Create exceptionally comprehensive and detailed study notes from the following document content. Analyze every aspect thoroughly and extract maximum educational value:

DOCUMENT CONTENT TO ANALYZE:
${extractedContent}

ADVANCED FORMATTING REQUIREMENTS:
- Use ## for main topics/sections with descriptive, informative titles
- Use ### for subtopics and detailed subsections
- Use * for bullet points with comprehensive explanations
- Use **bold** for key terms, critical concepts, and essential information
- Use *italics* for emphasis on important insights and connections
- Use clear line breaks and proper spacing for excellent readability
- Create hierarchical structure that flows logically from general to specific

COMPREHENSIVE CONTENT REQUIREMENTS:
- Extract and explain ALL key concepts, facts, and information in detail
- Provide thorough background context and clear definitions for technical terms
- Include specific examples, case studies, and practical applications mentioned
- Explain the "why" and "how" behind concepts, not just the "what"
- Identify and highlight cause-and-effect relationships and connections
- Include all important details, statistics, dates, figures, and specific data
- Add explanatory context where concepts might be complex or unclear
- Make connections between different ideas and concepts when applicable
- Ensure comprehensive coverage that leaves no important information out
- Create notes detailed enough for complete mastery of the subject matter

Create exceptionally detailed, comprehensive, and well-structured notes that would enable someone to achieve complete understanding and mastery of this document content.

IMPORTANT: Write ONLY the study notes content. Do not include any introductory phrases like "Here are the study notes" or concluding statements like "These notes cover..." - provide only the direct educational content formatted in markdown.`;
    }

    // Generate notes using AI
    const systemPrompt = mode === 'custom' && customPrompt
      ? "You are a world-class educator, content analyst, and learning specialist with expertise in creating exceptional educational materials. The user has provided you with extracted document content and specific instructions. Your task is to create the most comprehensive, detailed, and educationally valuable notes possible based on the provided content, following the user's instructions exactly. Use advanced markdown formatting techniques and ensure maximum educational impact. Do not ask for additional files or content - work with what has been provided and extract every bit of educational value from it."
      : "You are a world-class educator and learning specialist with expertise in creating exceptional study materials from document content. Your mission is to generate the most comprehensive, detailed, and well-structured notes possible. You excel at breaking down complex information into clear, understandable segments while maintaining depth and thoroughness. Use advanced markdown formatting and create educational content that is both comprehensive and highly readable, ensuring students can achieve complete mastery of the subject matter. Write only the study notes content without any introductory or concluding meta-commentary.";

    const aiResponse = await callAIApi(
      notesPrompt,
      systemPrompt
    );

    // Generate summary
    const summary = await callAIApi(
      `Create a concise 2-3 sentence summary of these study notes:\n\n${aiResponse}`,
      "You are a summarization expert. Create brief but informative summaries that capture the main points."
    );

    // Save to user's history
    // Store content in memory for quiz generation
    lastProcessedContent = {
      type: 'document',
      url: file.originalname,
      notes: aiResponse.split('\n').filter(n => n.trim()),
      summary,
      processedAt: new Date(),
      quizzes: []
    };

    console.log(`✅ File processed successfully`);

    res.json({
      notes: lastProcessedContent.notes,
      summary: lastProcessedContent.summary,
      fileName: file.originalname,
      contentLength: extractedContent.length
    });
  } catch (error) {
    console.error('File processing error:', error);
    res.status(500).json({ message: error.message || 'Failed to process uploaded file' });
  }
});

app.post('/api/content/regenerate-notes', async (req, res) => {
    try {
        const { instructions } = req.body;

        if (!instructions) {
            return res.status(400).json({ message: 'Instructions are required' });
        }

        if (!lastProcessedContent) {
            return res.status(400).json({ message: 'No content found to regenerate' });
        }

        // Call AI API with custom instructions
        const aiResponse = await callAIApi(
            `Original content: ${lastProcessedContent.url}. Regenerate notes with these instructions: ${instructions}`,
            "You are a versatile learning assistant that adapts notes based on user preferences."
        );

        // Update the notes
        lastProcessedContent.notes = aiResponse.split('\n').filter(n => n.trim());

        res.json({
            notes: lastProcessedContent.notes,
            summary: lastProcessedContent.summary
        });
    } catch (error) {
        console.error('Note regeneration error:', error);
        res.status(500).json({ message: error.message || 'Failed to regenerate notes' });
    }
});

// Quiz Endpoints
app.post('/api/quiz/generate', async (req, res) => {
    try {
        const { difficulty = 'medium', questionCount = 5 } = req.body;

        if (!lastProcessedContent) {
            return res.status(400).json({ message: 'No content found to generate quiz' });
        }

        if (!['easy', 'medium', 'hard'].includes(difficulty)) {
            return res.status(400).json({ message: 'Invalid difficulty level' });
        }

        if (questionCount < 1) {
            return res.status(400).json({ message: 'Question count must be at least 1' });
        }

        // Warn for very large numbers but don't block them
        if (questionCount > 100) {
            console.log(`⚠️ Large question count requested: ${questionCount}. This may take longer to generate.`);
        }

        console.log(`🎯 Generating ${difficulty} quiz with ${questionCount} questions`);

        // Create detailed prompt for quiz generation
        const quizPrompt = `Based on the following study notes, create a ${difficulty} difficulty quiz with exactly ${questionCount} multiple choice questions.

Study Notes:
${lastProcessedContent.notes.join('\n')}

IMPORTANT FORMATTING REQUIREMENTS:
- Create exactly ${questionCount} multiple choice questions
- Each question MUST have exactly 4 options (A, B, C, D)
- Difficulty level: ${difficulty}
- ${difficulty === 'easy' ? 'Focus on basic facts and definitions' :
   difficulty === 'medium' ? 'Include some analysis and application questions' :
   'Include complex analysis, synthesis, and evaluation questions'}
- STRICTLY follow this exact format for each question:

Question 1: [question text here]
A) [option 1]
B) [option 2]
C) [option 3]
D) [option 4]
Correct Answer: A

Question 2: [question text here]
A) [option 1]
B) [option 2]
C) [option 3]
D) [option 4]
Correct Answer: B

Continue this pattern for all ${questionCount} questions.

CRITICAL:
- Number each question sequentially (Question 1, Question 2, etc.)
- Use exactly "A)", "B)", "C)", "D)" for options
- Use exactly "Correct Answer: [letter]" format
- Do not add extra text or explanations
- Make sure all questions are directly related to the provided content
- If generating many questions, ensure consistent formatting throughout`;

        let questions = [];
        let attempts = 0;
        const maxAttempts = 3;

        // For large question counts (>20), generate in batches
        if (questionCount > 20) {
            console.log(`📦 Large question count (${questionCount}), generating in batches...`);
            const batchSize = 15;
            const batches = Math.ceil(questionCount / batchSize);

            for (let batch = 0; batch < batches && questions.length < questionCount; batch++) {
                const remainingQuestions = questionCount - questions.length;
                const currentBatchSize = Math.min(batchSize, remainingQuestions);

                console.log(`📦 Generating batch ${batch + 1}/${batches} (${currentBatchSize} questions)`);

                const batchPrompt = quizPrompt.replace(
                    `exactly ${questionCount} multiple choice questions`,
                    `exactly ${currentBatchSize} multiple choice questions`
                ).replace(
                    `all ${questionCount} questions`,
                    `all ${currentBatchSize} questions`
                );

                try {
                    const quizResponse = await callAIApi(
                        batchPrompt,
                        "You are a world-class educational assessment specialist and expert quiz creator with extensive experience in developing high-quality multiple choice questions. You excel at creating questions that accurately assess student understanding while maintaining perfect formatting consistency. Your questions are pedagogically sound, appropriately challenging, and designed to reinforce learning. You always follow formatting requirements precisely and create educationally valuable assessments.",
                        60000 // 60 second timeout for quiz generation
                    );

                    console.log(`🤖 AI Quiz Response received for batch ${batch + 1}`);
                    const batchQuestions = parseQuizResponse(quizResponse, currentBatchSize);

                    if (batchQuestions.length > 0) {
                        questions.push(...batchQuestions);
                        console.log(`📊 Added ${batchQuestions.length} questions from batch ${batch + 1}. Total: ${questions.length}`);
                    }

                    // Small delay between batches to avoid rate limiting
                    if (batch < batches - 1) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }

                } catch (error) {
                    console.error(`❌ Batch ${batch + 1} failed:`, error.message);
                    // Continue with next batch instead of failing completely
                }
            }
        } else {
            // For smaller question counts, use the original approach
            while (questions.length < Math.min(questionCount, 10) && attempts < maxAttempts) {
                attempts++;
                console.log(`🎯 Attempt ${attempts}/${maxAttempts} to generate questions`);

                try {
                    const quizResponse = await callAIApi(
                        quizPrompt,
                        "You are a world-class educational assessment specialist and expert quiz creator with extensive experience in developing high-quality multiple choice questions. You excel at creating questions that accurately assess student understanding while maintaining perfect formatting consistency. Your questions are pedagogically sound, appropriately challenging, and designed to reinforce learning. You always follow formatting requirements precisely and create educationally valuable assessments.",
                        60000 // 60 second timeout for quiz generation
                    );

                    console.log('🤖 AI Quiz Response received');

                    // Parse the AI response to extract questions
                    console.log('🔍 Raw AI Response (first 500 chars):', quizResponse.substring(0, 500));
                    const parsedQuestions = parseQuizResponse(quizResponse, questionCount);

                    if (parsedQuestions.length > questions.length) {
                        questions = parsedQuestions;
                        console.log(`📊 Parsed ${questions.length} questions out of ${questionCount} requested`);
                    }

                    // If we got a reasonable number of questions, break
                    if (questions.length >= Math.min(questionCount, 5)) {
                        break;
                    }

                } catch (error) {
                    console.error(`❌ Attempt ${attempts} failed:`, error.message);
                    if (attempts === maxAttempts) {
                        throw error;
                    }
                }
            }
        }

        if (questions.length === 0) {
            console.error('❌ No questions could be parsed from AI response after all attempts');
            throw new Error('Failed to parse quiz questions from AI response');
        }

        // Trim to exact count if we got more than requested
        if (questions.length > questionCount) {
            questions = questions.slice(0, questionCount);
            console.log(`✂️ Trimmed to exactly ${questionCount} questions`);
        }

        // If we got fewer questions than requested, that's still okay
        if (questions.length < questionCount) {
            console.log(`⚠️ Got ${questions.length} questions instead of ${questionCount} requested`);
        }

        // Save quiz to user's history
        const quizItem = {
            difficulty,
            questions,
            questionCount: questions.length,
            createdAt: new Date(),
            score: null,
            takenAt: null
        };

        lastProcessedContent.quizzes.push(quizItem);

        console.log(`✅ Generated ${questions.length} questions successfully`);

        res.json({
            quiz: questions,
            difficulty,
            questionCount: questions.length
        });
    } catch (error) {
        console.error('Quiz generation error:', error);
        res.status(500).json({ message: error.message || 'Failed to generate quiz' });
    }
});

// Helper function to parse quiz response
function parseQuizResponse(response, expectedCount) {
    const questions = [];

    try {
        // First, try to parse as JSON in case the AI returned structured data
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            try {
                const parsedQuestions = JSON.parse(jsonMatch[0]);
                if (Array.isArray(parsedQuestions) && parsedQuestions.length > 0) {
                    console.log('✅ Successfully parsed JSON format');
                    return parsedQuestions.slice(0, expectedCount);
                }
            } catch (e) {
                console.log('⚠️ JSON parsing failed, trying text parsing...');
            }
        }

        // Fallback to text parsing
        const lines = response.split('\n').map(line => line.trim()).filter(line => line);

        let currentQuestion = null;
        let options = [];
        let correctAnswer = null;
        let questionNumber = 0;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // More flexible question detection
            if (line.match(/^Question \d+:/i) ||
                line.match(/^\d+\./) ||
                line.match(/^Q\d+:/i) ||
                line.match(/^\d+\)\s*/)) {

                // Save previous question if valid
                if (currentQuestion && options.length >= 2 && correctAnswer) {
                    questions.push({
                        question: currentQuestion,
                        type: 'mcq',
                        options: options,
                        correctAnswer: correctAnswer
                    });
                    questionNumber++;
                }

                // Start new question
                currentQuestion = line
                    .replace(/^Question \d+:\s*/i, '')
                    .replace(/^\d+\.\s*/, '')
                    .replace(/^Q\d+:\s*/i, '')
                    .replace(/^\d+\)\s*/, '');
                options = [];
                correctAnswer = null;
            }
            // Check for options (more flexible patterns)
            else if (line.match(/^[A-D]\)/) || line.match(/^[A-D]\./) || line.match(/^[A-D]:/)) {
                const option = line.replace(/^[A-D][\)\.:]?\s*/, '').trim();
                if (option) {
                    options.push(option);
                }
            }
            // Check for correct answer (multiple patterns)
            else if (line.match(/^(Correct Answer|Answer|Correct):\s*[A-D]/i)) {
                const answerMatch = line.match(/[A-D]/i);
                if (answerMatch) {
                    const answerLetter = answerMatch[0].toUpperCase();
                    const answerIndex = answerLetter.charCodeAt(0) - 65; // A=0, B=1, C=2, D=3
                    if (answerIndex >= 0 && answerIndex < options.length) {
                        correctAnswer = options[answerIndex];
                    }
                }
            }
            // Alternative: if line starts with "Answer:" and contains the full answer text
            else if (line.match(/^(Answer|Correct):/i) && !line.match(/[A-D]/)) {
                const answerText = line.replace(/^(Answer|Correct):\s*/i, '').trim();
                if (options.includes(answerText)) {
                    correctAnswer = answerText;
                }
            }

            // Stop if we have enough questions
            if (questions.length >= expectedCount) {
                break;
            }
        }

        // Save last question if valid
        if (currentQuestion && options.length >= 2 && correctAnswer && questions.length < expectedCount) {
            questions.push({
                question: currentQuestion,
                type: 'mcq',
                options: options,
                correctAnswer: correctAnswer
            });
        }

        console.log(`📝 Parsed ${questions.length} valid questions from text format`);
        return questions.slice(0, expectedCount);

    } catch (error) {
        console.error('❌ Error in parseQuizResponse:', error);
        return [];
    }
}

app.post('/api/quiz/change-difficulty', async (req, res) => {
    try {
        const { difficulty } = req.body;

        if (!['easy', 'medium', 'hard'].includes(difficulty)) {
            return res.status(400).json({ message: 'Invalid difficulty level' });
        }

        if (!lastProcessedContent) {
            return res.status(400).json({ message: 'No content found' });
        }

        // Create detailed prompt for quiz generation (same as main generation)
        const questionCount = 5; // Default for difficulty change
        const quizPrompt = `Based on the following study notes, create a ${difficulty} difficulty quiz with exactly ${questionCount} multiple choice questions.

Study Notes:
${lastProcessedContent.notes.join('\n')}

IMPORTANT FORMATTING REQUIREMENTS:
- Create exactly ${questionCount} multiple choice questions
- Each question MUST have exactly 4 options (A, B, C, D)
- Difficulty level: ${difficulty}
- ${difficulty === 'easy' ? 'Focus on basic facts and definitions' :
   difficulty === 'medium' ? 'Include some analysis and application questions' :
   'Include complex analysis, synthesis, and evaluation questions'}
- STRICTLY follow this exact format for each question:

Question 1: [question text here]
A) [option 1]
B) [option 2]
C) [option 3]
D) [option 4]
Correct Answer: A

Continue this pattern for all ${questionCount} questions.

CRITICAL:
- Number each question sequentially (Question 1, Question 2, etc.)
- Use exactly "A)", "B)", "C)", "D)" for options
- Use exactly "Correct Answer: [letter]" format
- Do not add extra text or explanations
- Make sure all questions are directly related to the provided content`;

        const quizResponse = await callAIApi(
            quizPrompt,
            "You are a world-class educational assessment specialist and expert quiz creator with extensive experience in developing high-quality multiple choice questions. You excel at creating questions that accurately assess student understanding while maintaining perfect formatting consistency. Your questions are pedagogically sound, appropriately challenging, and designed to reinforce learning. You always follow formatting requirements precisely and create educationally valuable assessments.",
            60000 // 60 second timeout for quiz generation
        );

        console.log('🤖 AI Quiz Response received for difficulty change');

        // Use the same robust parsing function
        const questions = parseQuizResponse(quizResponse, questionCount);

        if (questions.length === 0) {
            throw new Error('Failed to parse quiz questions from AI response');
        }

        // Update quiz in user's history
        const quizItem = {
            difficulty,
            questions,
            questionCount: questions.length,
            takenAt: new Date()
        };

        lastProcessedContent.quizzes.push(quizItem);

        res.json({
            quiz: questions,
            difficulty: difficulty,
            questionCount: questions.length
        });
    } catch (error) {
        console.error('Quiz difficulty change error:', error);
        res.status(500).json({ message: error.message || 'Failed to change quiz difficulty' });
    }
});

app.post('/api/quiz/submit', async (req, res) => {
    try {
        const { answers } = req.body;

        if (!answers || !Array.isArray(answers)) {
            return res.status(400).json({ message: 'Answers are required' });
        }

        if (!lastProcessedContent || !lastProcessedContent.quizzes.length) {
            return res.status(400).json({ message: 'No quiz found' });
        }

        const currentQuiz = lastProcessedContent.quizzes[lastProcessedContent.quizzes.length - 1];
        const results = [];
        let correctCount = 0;

        // Evaluate answers (simplified - in production would use AI evaluation)
        answers.forEach((answer, index) => {
            const question = currentQuiz.questions[index];
            let isCorrect = false;
            let feedback = '';
            
            if (question.type === 'mcq') {
                isCorrect = answer.answer === question.correctAnswer;
                feedback = isCorrect ? 
                    "Correct! Well done." : 
                    `Incorrect. The right answer is: ${question.correctAnswer}`;
            } else {
                // For text answers, we would normally use AI to evaluate
                // Here we just do a simple check for demo purposes
                isCorrect = answer.answer.length > 10; // Arbitrary check
                feedback = isCorrect ? 
                    "Good answer! You've demonstrated understanding." : 
                    "Your answer seems too brief. Try to elaborate more.";
            }
            
            if (isCorrect) correctCount++;
            results.push({ questionId: index, isCorrect, feedback });
        });

        // Update quiz with results
        currentQuiz.score = Math.round((correctCount / answers.length) * 100);
        currentQuiz.takenAt = new Date();

        res.json({ results, score: currentQuiz.score });
    } catch (error) {
        console.error('Quiz submission error:', error);
        res.status(500).json({ message: error.message || 'Failed to submit quiz' });
    }
});

// Serve home page as main entry point
app.get('/', (_, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Serve home page for any other route
app.get('*', (_, res) => {
    res.sendFile(path.join(__dirname, 'public', 'home.html'));
});

// Start server only when not in Vercel environment
if (!isVercel) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
} else {
  console.log('Running in Vercel environment - ready for serverless functions');
}

// Export for Vercel serverless functions
module.exports = app;
