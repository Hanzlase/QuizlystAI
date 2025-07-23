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

            try {
                // Extract YouTube video transcript with timeout
                const transcript = await Promise.race([
                    YoutubeTranscript.fetchTranscript(url),
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

                // Try fallback method: extract video metadata (title, description)
                console.log('📺 Attempting fallback: extracting video metadata...');
                try {
                    const videoPageResponse = await axios.get(url, {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                        },
                        timeout: 10000
                    });

                    const $ = cheerio.load(videoPageResponse.data);

                    // Extract video title and description
                    let title = $('meta[property="og:title"]').attr('content') ||
                               $('title').text() || '';
                    let description = $('meta[property="og:description"]').attr('content') ||
                                    $('meta[name="description"]').attr('content') || '';

                    // Try to extract more content from the page
                    const videoDescription = $('#watch-description-text').text() ||
                                           $('.content').text() ||
                                           $('#description').text() || '';

                    let fallbackContent = '';
                    if (title) fallbackContent += `Title: ${title}\n\n`;
                    if (description) fallbackContent += `Description: ${description}\n\n`;
                    if (videoDescription) fallbackContent += `Video Description: ${videoDescription}`;

                    if (fallbackContent.length > 100) {
                        console.log('📺 Fallback successful: extracted metadata');
                        return fallbackContent;
                    }
                } catch (fallbackError) {
                    console.error('📺 Fallback extraction also failed:', fallbackError.message);
                }

                // Provide specific error messages for common YouTube issues
                if (youtubeError.message.includes('captions')) {
                    throw new Error('This YouTube video does not have captions/subtitles available. Please try a video with captions enabled.');
                } else if (youtubeError.message.includes('timeout')) {
                    throw new Error('YouTube video processing timed out. Please try again or use a shorter video.');
                } else if (youtubeError.message.includes('too many requests')) {
                    throw new Error('YouTube is temporarily blocking requests. Please wait a few minutes and try again.');
                } else if (youtubeError.message.includes('unavailable')) {
                    throw new Error('This YouTube video is unavailable or private. Please check the URL and try again.');
                } else {
                    throw new Error(`YouTube processing failed: ${youtubeError.message}`);
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
const callAIApi = async (prompt, instructions = '', timeout = 50000) => { // 50 second timeout
    // Check if primary API key is available
    if (!process.env.API_KEY) {
        throw new Error('API_KEY environment variable is not set');
    }

    // Primary model (OpenRouter) and fallback model (Cohere)
    const modelConfigs = [
        {
            model: "qwen/qwen3-235b-a22b-07-25:free",
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
            notesPrompt = `Create comprehensive, detailed study notes from the following content. Format your response using proper markdown with clear structure:

Content:
${extractedContent}

FORMATTING REQUIREMENTS:
- Use ## for main headings
- Use ### for subheadings
- Use * for bullet points
- Use **bold** for important terms
- Use proper line breaks between sections
- Create clear, organized structure

CONTENT REQUIREMENTS:
- Create detailed explanations for all key concepts
- Include background context and definitions
- Add examples and practical applications where relevant
- Explain the "why" behind concepts, not just the "what"
- Make it comprehensive enough for complete learning
- Include any important details, statistics, or specific information mentioned

Format the response as well-structured markdown that will be easy to read and understand.`;
        }

        console.log(`🤖 Generating detailed notes (${mode} mode)...`);

        // Generate detailed notes using AI
        const systemPrompt = mode === 'custom' && customPrompt
            ? "You are an expert educator and content analyst. The user has provided you with extracted content and specific instructions. Create detailed notes based on the provided content following the user's instructions exactly. Use proper markdown formatting. Do not ask for additional content - work with what has been provided."
            : "You are an expert educator creating comprehensive study materials. Generate detailed, well-structured notes using proper markdown formatting. Use ## for main headings, ### for subheadings, * for bullet points, **bold** for key terms, and clear line breaks. Create organized, educational content that's easy to read and understand.";

        const aiResponse = await callAIApi(
            notesPrompt,
            systemPrompt,
            50000 // 50 second timeout for notes
        );

        console.log(`📝 Notes generated, creating summary...`);

        // Generate summary with shorter prompt
        const summary = await callAIApi(
            `Summarize in 2-3 sentences: ${aiResponse}`,
            "Create brief summaries.",
            50000 // 50 second timeout for summary
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

// Modified file upload endpoint for Vercel
app.post('/api/content/upload', isVercel ? (_, res) => {
  res.status(403).json({
    message: 'File uploads are disabled in production. Please use URL input instead.'
  });
} : upload.single('file'), async (req, res) => {
  try {
    const { mode = 'simple', customPrompt } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: 'File is required' });
    }

    console.log(`📁 Processing uploaded file: ${file.originalname}`);

    // Extract content from the uploaded file
    const extractedContent = await extractFileContent(file);

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
      notesPrompt = `Please create comprehensive study notes from the following document content. Focus on key concepts, important facts, and explanations:

DOCUMENT CONTENT:
${extractedContent}

Create detailed, well-structured notes using markdown formatting with headers, bullet points, and clear organization.`;
    }

    // Generate notes using AI
    const systemPrompt = mode === 'custom' && customPrompt
      ? "You are an expert educator and content analyst. The user has provided you with extracted document content and specific instructions. Create detailed notes based on the provided content following the user's instructions exactly. Use proper markdown formatting. Do not ask for additional files or content - work with what has been provided."
      : "You are an expert educator who creates clear, well-structured study notes. Format your response with bullet points, headings, and clear explanations.";

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
                        "You are an expert quiz creator who generates well-structured multiple choice questions for educational assessment.",
                        50000 // 50 second timeout for quiz generation
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
                        "You are an expert quiz creator who generates well-structured multiple choice questions for educational assessment.",
                        50000 // 50 second timeout for quiz generation
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
            "You are an expert quiz creator who generates well-structured multiple choice questions for educational assessment.",
            50000 // 50 second timeout for quiz generation
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
