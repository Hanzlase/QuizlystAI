document.addEventListener('DOMContentLoaded', function() {
    // Initialize theme
    initializeTheme();

    // Initialize question count functionality
    initializeQuestionCount();

    // Content type selection
    const uploadOptions = document.querySelectorAll('.upload-option');
    const linkForm = document.getElementById('linkForm');
    const fileForm = document.getElementById('fileForm');
    let selectedContentType = 'link';

    uploadOptions.forEach(option => {
        option.addEventListener('click', function() {
            uploadOptions.forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');

            selectedContentType = this.dataset.type;
            const urlInfo = document.getElementById('urlInfo');

            if (selectedContentType === 'link' || selectedContentType === 'youtube') {
                linkForm.classList.remove('hidden');
                fileForm.classList.add('hidden');

                if (selectedContentType === 'youtube') {
                    document.getElementById('contentUrl').placeholder = 'Enter YouTube URL (e.g., https://youtube.com/watch?v=...)';
                    urlInfo.innerHTML = '<small>💡 <strong>YouTube Requirements:</strong> Video must have captions/subtitles enabled. Look for the [CC] button on the video player.</small>';
                } else {
                    document.getElementById('contentUrl').placeholder = 'Enter URL (e.g., https://example.com)';
                    urlInfo.innerHTML = '<small>💡 Works best with articles, blog posts, and text-heavy web pages</small>';
                }
            } else if (selectedContentType === 'document') {
                linkForm.classList.add('hidden');
                fileForm.classList.remove('hidden');
            }
        });
    });

    // Analyze content
    document.getElementById('analyzeBtn').addEventListener('click', async function() {
        const url = document.getElementById('contentUrl').value.trim();
        if (!url) {
            alert('Please enter a valid URL');
            return;
        }

        const processingSection = document.getElementById('processingSection');
        const notesSection = document.getElementById('notesSection');
        
        processingSection.classList.remove('hidden');
        updateProcessingMessage('Extracting content...');
        showTimeoutWarning();

        try {
            // Simulate API call to process content
            const response = await fetch('/api/content/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url,
                    type: selectedContentType,
                    mode: document.querySelector('.notes-option.active')?.dataset.mode || 'simple',
                    customPrompt: document.getElementById('customInstructions').value.trim()
                })
            });

            updateProcessingMessage('Processing with AI...');

            // Check if response is actually JSON
            const contentType = response.headers.get('content-type');
            if (!contentType || !contentType.includes('application/json')) {
                const text = await response.text();
                console.error('Non-JSON response received:', text);
                throw new Error('Server returned non-JSON response. Please check server logs.');
            }

            const data = await response.json();
            
            if (response.ok) {
                // Display notes
                displayNotes(data.notes, data.summary);
                processingSection.classList.add('hidden');
                notesSection.classList.remove('hidden');
            } else {
                throw new Error(data.message || 'Failed to process content');
            }
        } catch (error) {
            console.error('Error:', error);

            // Provide helpful error messages for YouTube issues
            let errorMessage = error.message;
            if (selectedContentType === 'youtube' && error.message.includes('captions')) {
                errorMessage = `❌ YouTube Error: This video doesn't have captions/subtitles.

📝 To fix this:
• Look for videos with the [CC] button in the player
• Try educational channels like Khan Academy, Coursera, or TED
• Search for "lecture" or "tutorial" videos which often have captions

💡 Tip: You can also try copying the video description or transcript if available manually.`;
            } else if (error.message.includes('JSON')) {
                errorMessage = `❌ Server Error: The server is not responding correctly.

This might be a deployment issue. Please try:
• Refreshing the page
• Waiting a few minutes and trying again
• Checking if the server is properly deployed

Technical details: ${error.message}`;
            }

            alert(errorMessage);
            processingSection.classList.add('hidden');
        }
    });

    // File upload (supports multiple files)
    document.getElementById('uploadBtn').addEventListener('click', async function() {
        const fileInput = document.getElementById('contentFile');
        const files = fileInput.files;

        if (!files || files.length === 0) {
            alert('Please select at least one file');
            return;
        }

        const processingSection = document.getElementById('processingSection');
        const notesSection = document.getElementById('notesSection');

        processingSection.classList.remove('hidden');
        updateProcessingMessage(`Processing ${files.length} file(s)...`);
        showTimeoutWarning();

        try {
            let allNotes = [];
            let allSummaries = [];

            // Process each file
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                updateProcessingMessage(`Processing file ${i + 1}/${files.length}: ${file.name}`);

                const formData = new FormData();
                formData.append('file', file);
                formData.append('mode', document.querySelector('.notes-option.active')?.dataset.mode || 'simple');
                formData.append('customPrompt', document.getElementById('customInstructions').value.trim());

                const response = await fetch('/api/content/upload', {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (response.ok) {
                    // Add file header to notes
                    allNotes.push(`## 📄 ${data.fileName}`);
                    allNotes.push('---');
                    allNotes.push(...data.notes);
                    allNotes.push(''); // Add spacing between files

                    allSummaries.push(`**${data.fileName}:** ${data.summary}`);

                    console.log(`✅ Processed file ${i + 1}: ${data.fileName} (${data.contentLength} characters)`);
                } else {
                    throw new Error(`Failed to process ${file.name}: ${data.message}`);
                }
            }

            // Display combined notes
            const combinedSummary = files.length > 1 ?
                `Combined summary of ${files.length} files:\n\n${allSummaries.join('\n\n')}` :
                allSummaries[0];

            displayNotes(allNotes, combinedSummary);
            processingSection.classList.add('hidden');
            notesSection.classList.remove('hidden');

            console.log(`✅ Successfully processed all ${files.length} file(s)`);

        } catch (error) {
            console.error('Error:', error);
            alert('Error processing files: ' + error.message);
            processingSection.classList.add('hidden');
        }
    });

    // Notes mode selection
    const notesOptions = document.querySelectorAll('.notes-option');
    const customOptions = document.getElementById('customOptions');
    
    notesOptions.forEach(option => {
        option.addEventListener('click', function() {
            notesOptions.forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
            
            if (this.dataset.mode === 'custom') {
                customOptions.classList.remove('hidden');
            } else {
                customOptions.classList.add('hidden');
            }
        });
    });

    // Regenerate notes
    document.getElementById('regenerateNotes').addEventListener('click', async function() {
        const instructions = document.getElementById('customInstructions').value.trim();
        if (!instructions) {
            alert('Please enter instructions for custom notes');
            return;
        }

        const processingSection = document.getElementById('processingSection');
        processingSection.classList.remove('hidden');
        
        try {
            // Simulate API call to regenerate notes
            const response = await fetch('/api/content/regenerate-notes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ instructions })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                displayNotes(data.notes, data.summary);
                processingSection.classList.add('hidden');
            } else {
                throw new Error(data.message || 'Failed to regenerate notes');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error regenerating notes: ' + error.message);
            processingSection.classList.add('hidden');
        }
    });

    // Generate quiz with settings from notes section
    document.getElementById('generateQuizBtn').addEventListener('click', async function() {
        const difficulty = document.querySelector('.quiz-option.active')?.dataset.difficulty || 'medium';
        const questionCount = getSelectedQuestionCount();

        // If validation failed, don't proceed
        if (questionCount === null) {
            return;
        }

        const processingSection = document.getElementById('processingSection');
        const quizLoadingSection = document.getElementById('quizLoadingSection');
        const quizSection = document.getElementById('quizSection');

        // Show quiz loading section
        quizLoadingSection.classList.remove('hidden');
        quizSection.classList.add('hidden');

        // Start the loading animation
        startQuizLoadingAnimation();
        const quizContainer = document.getElementById('quizContainer');
        const quizInfo = document.getElementById('quizInfo');
        const submitBtn = document.getElementById('submitQuizBtn');
        const retakeBtn = document.getElementById('retakeQuizBtn');
        const quizResults = document.getElementById('quizResults');

        processingSection.classList.remove('hidden');
        updateProcessingMessage(`Generating ${questionCount} ${difficulty} questions...`);
        showTimeoutWarning();

        // Reset quiz section
        quizContainer.innerHTML = '';
        submitBtn.classList.add('hidden');
        retakeBtn.classList.add('hidden');
        quizResults.classList.add('hidden');

        try {
            const response = await fetch('/api/quiz/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    difficulty,
                    questionCount
                })
            });

            const data = await response.json();

            if (response.ok) {
                // Show quiz info
                quizInfo.innerHTML = `
                    <div class="quiz-header">
                        <span class="quiz-difficulty ${difficulty}">${difficulty.toUpperCase()}</span>
                        <span class="quiz-count">${data.questionCount} Questions</span>
                    </div>
                    <p>Answer all questions below, then click "Check My Answers" to see your results.</p>
                `;

                // Clear loading animation
                if (window.quizLoadingInterval) {
                    clearInterval(window.quizLoadingInterval);
                }

                displayQuiz(data.quiz, difficulty, data.questionCount);
                processingSection.classList.add('hidden');
                quizLoadingSection.classList.add('hidden');
                quizSection.classList.remove('hidden');
                submitBtn.classList.remove('hidden');
                retakeBtn.classList.remove('hidden');

                console.log(`✅ Generated ${data.questionCount} ${data.difficulty} questions`);
            } else {
                throw new Error(data.message || 'Failed to generate quiz');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error generating quiz: ' + error.message);

            // Clear loading animation
            if (window.quizLoadingInterval) {
                clearInterval(window.quizLoadingInterval);
            }

            processingSection.classList.add('hidden');
            quizLoadingSection.classList.add('hidden');
        }
    });

    // Retake quiz button
    document.getElementById('retakeQuizBtn').addEventListener('click', function() {
        // Scroll back to quiz settings
        document.querySelector('.quiz-generation-section').scrollIntoView({ behavior: 'smooth' });
    });

    // Quiz difficulty selection
    const quizOptions = document.querySelectorAll('.quiz-option');
    
    quizOptions.forEach(option => {
        option.addEventListener('click', async function() {
            quizOptions.forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
            
            const difficulty = this.dataset.difficulty;
            const processingSection = document.getElementById('processingSection');
            processingSection.classList.remove('hidden');
            
            try {
                // Simulate API call to change quiz difficulty
                const response = await fetch('/api/quiz/change-difficulty', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ difficulty })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    displayQuiz(data.quiz);
                    processingSection.classList.add('hidden');
                } else {
                    throw new Error(data.message || 'Failed to change quiz difficulty');
                }
            } catch (error) {
                console.error('Error:', error);
                alert('Error changing quiz difficulty: ' + error.message);
                processingSection.classList.add('hidden');
            }
        });
    });

    // Submit quiz
    document.getElementById('submitQuizBtn').addEventListener('click', async function() {
        const quizContainer = document.getElementById('quizContainer');
        const questions = quizContainer.querySelectorAll('.quiz-question');
        const answers = [];

        // Collect all answers
        questions.forEach((question, index) => {
            const answerInput = question.querySelector('.quiz-answer-input');
            const selectedOption = question.querySelector('input[type="radio"]:checked');

            let userAnswer = null;
            if (answerInput) {
                userAnswer = answerInput.value.trim();
                answers.push({
                    questionId: index,
                    type: 'text',
                    answer: userAnswer
                });
            } else if (selectedOption) {
                userAnswer = selectedOption.value;
                answers.push({
                    questionId: index,
                    type: 'mcq',
                    answer: userAnswer
                });
            } else {
                // No answer selected for this question
                answers.push({
                    questionId: index,
                    type: 'mcq',
                    answer: null
                });
            }
        });

        // Check if all questions are answered
        const unansweredCount = answers.filter(a => !a.answer || a.answer === '').length;
        if (unansweredCount > 0) {
            const proceed = confirm(`You have ${unansweredCount} unanswered question(s). Do you want to submit anyway?`);
            if (!proceed) return;
        }

        try {
            updateProcessingMessage('Checking your answers...');
            const processingSection = document.getElementById('processingSection');
            processingSection.classList.remove('hidden');

            const response = await fetch('/api/quiz/submit', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ answers })
            });

            const data = await response.json();

            if (response.ok) {
                // Add user answers to results for display
                const resultsWithUserAnswers = data.results.map((result, index) => ({
                    ...result,
                    userAnswer: answers[index]?.answer || 'No answer'
                }));

                processingSection.classList.add('hidden');
                displayQuizResults(resultsWithUserAnswers);

                // Hide submit button and show retake button
                document.getElementById('submitQuizBtn').classList.add('hidden');

                console.log(`✅ Quiz submitted: ${data.score}% score`);
            } else {
                throw new Error(data.message || 'Failed to submit quiz');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error submitting quiz: ' + error.message);
            document.getElementById('processingSection').classList.add('hidden');
        }
    });

    // Helper functions
    function displayNotes(notes, summary) {
        document.getElementById('notesOutput').innerHTML = formatNotes(notes);
        document.getElementById('summaryOutput').innerHTML = formatSummary(summary);
    }

    function formatNotes(notes) {
        if (Array.isArray(notes)) {
            return notes.map(note => formatMarkdown(note)).join('');
        }
        return formatMarkdown(notes);
    }

    function formatMarkdown(text) {
        if (!text) return '';

        // Split into lines for better processing
        let lines = text.split('\n');
        let html = '';
        let inList = false;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();

            // Skip empty lines but add spacing
            if (!line) {
                if (inList) {
                    html += '</ul>';
                    inList = false;
                }
                if (i < lines.length - 1 && lines[i + 1].trim()) {
                    html += '<br>';
                }
                continue;
            }

            // Headers
            if (line.startsWith('### ')) {
                if (inList) { html += '</ul>'; inList = false; }
                html += `<h3>${applyInlineFormatting(line.substring(4))}</h3>`;
            } else if (line.startsWith('## ')) {
                if (inList) { html += '</ul>'; inList = false; }
                html += `<h2>${applyInlineFormatting(line.substring(3))}</h2>`;
            } else if (line.startsWith('# ')) {
                if (inList) { html += '</ul>'; inList = false; }
                html += `<h1>${applyInlineFormatting(line.substring(2))}</h1>`;
            }
            // List items
            else if (line.startsWith('* ') || line.startsWith('- ')) {
                if (!inList) {
                    html += '<ul>';
                    inList = true;
                }
                let listItem = line.substring(2);
                html += `<li>${applyInlineFormatting(listItem)}</li>`;
            }
            // Numbered lists
            else if (/^\d+\.\s/.test(line)) {
                if (!inList) {
                    html += '<ol>';
                    inList = true;
                }
                let listItem = line.replace(/^\d+\.\s/, '');
                html += `<li>${applyInlineFormatting(listItem)}</li>`;
            }
            // Regular paragraphs
            else {
                if (inList) {
                    html += inList === 'ul' ? '</ul>' : '</ol>';
                    inList = false;
                }
                html += `<p>${applyInlineFormatting(line)}</p>`;
            }
        }

        // Close any open lists
        if (inList) {
            html += '</ul>';
        }

        return html;
    }

    function applyInlineFormatting(text) {
        return text
            // Bold text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // Italic text
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // Inline code
            .replace(/`(.*?)`/g, '<code>$1</code>');
    }

    function formatSummary(summary) {
        if (Array.isArray(summary)) {
            return `<ul>${summary.map(item => `<li>${item}</li>`).join('')}</ul>`;
        }
        // Apply same formatting to summary
        return formatNotes(summary);
    }

    function displayQuiz(quiz, difficulty, questionCount) {
        const quizContainer = document.getElementById('quizContainer');
        quizContainer.innerHTML = '';

        // Store quiz data for checking answers later
        window.currentQuiz = quiz;

        quiz.forEach((question, index) => {
            const questionElement = document.createElement('div');
            questionElement.className = 'quiz-question';
            questionElement.innerHTML = `
                <div class="question-header">
                    <span class="question-number">Question ${index + 1} of ${questionCount || quiz.length}</span>
                </div>
                <h3 class="question-text">${question.question}</h3>
                ${question.type === 'mcq' ?
                    `<div class="quiz-options-list">
                        ${question.options.map((option, optIndex) => `
                            <div class="quiz-option-item">
                                <input type="radio" id="q${index}-${optIndex}" name="q${index}" value="${option}" data-question="${index}">
                                <label for="q${index}-${optIndex}">
                                    <span class="option-letter">${String.fromCharCode(65 + optIndex)}.</span>
                                    <span class="option-text">${option}</span>
                                </label>
                            </div>
                        `).join('')}
                    </div>` :
                    `<textarea class="quiz-answer-input" name="q${index}" placeholder="Type your answer here..." data-question="${index}"></textarea>`
                }
            `;
            quizContainer.appendChild(questionElement);
        });

        document.getElementById('quizResults').classList.add('hidden');

        // Scroll to quiz
        setTimeout(() => {
            quizContainer.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }

    function displayQuizResults(results) {
        const quizResults = document.getElementById('quizResults');
        quizResults.classList.remove('hidden');

        let correctCount = 0;
        let wrongCount = 0;

        // Calculate scores
        results.forEach(result => {
            if (result.isCorrect) {
                correctCount++;
            } else {
                wrongCount++;
            }
        });

        const totalQuestions = results.length;
        const percentage = Math.round((correctCount / totalQuestions) * 100);

        // Update score display
        document.getElementById('scorePercentage').textContent = `${percentage}%`;
        document.getElementById('correctCount').textContent = correctCount;
        document.getElementById('incorrectCount').textContent = wrongCount;
        document.getElementById('totalQuestions').textContent = totalQuestions;

        // Update score circle
        updateScoreCircle(percentage);

        // Update progress bar
        updateProgressBar(percentage);

        // Create charts
        createResultsChart(correctCount, wrongCount);

        // Show detailed results
        displayDetailedResults(results);

        // Scroll to results
        setTimeout(() => {
            quizResults.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    }

    function updateScoreCircle(percentage) {
        const scoreCircle = document.querySelector('.score-circle');
        const degrees = (percentage / 100) * 360;
        scoreCircle.style.background = `conic-gradient(var(--primary-color) ${degrees}deg, var(--border-color) ${degrees}deg)`;
    }

    function updateProgressBar(percentage) {
        const progressFill = document.getElementById('progressFill');
        setTimeout(() => {
            progressFill.style.width = `${percentage}%`;
        }, 500);
    }

    function createResultsChart(correctCount, wrongCount) {
        const ctx = document.getElementById('resultsChart').getContext('2d');

        // Destroy existing chart if it exists
        if (window.resultsChartInstance) {
            window.resultsChartInstance.destroy();
        }

        window.resultsChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Correct', 'Incorrect'],
                datasets: [{
                    data: [correctCount, wrongCount],
                    backgroundColor: [
                        '#10b981',
                        '#ef4444'
                    ],
                    borderWidth: 0,
                    cutout: '70%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: 20,
                            usePointStyle: true,
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary')
                        }
                    }
                }
            }
        });
    }

    function displayDetailedResults(results) {
        const detailedResults = document.getElementById('detailedResults');
        detailedResults.innerHTML = '<h4>Question Details</h4>';

        results.forEach((result, index) => {
            const question = window.currentQuiz[index];
            const resultElement = document.createElement('div');
            resultElement.className = `result-item ${result.isCorrect ? 'correct' : 'incorrect'}`;

            resultElement.innerHTML = `
                <div class="result-question">
                    <strong>Question ${index + 1}:</strong> ${question.question}
                </div>
                <div class="result-answer ${result.isCorrect ? 'correct' : 'incorrect'}">
                    <strong>Your Answer:</strong> ${result.userAnswer || 'No answer selected'}
                </div>
                ${!result.isCorrect ? `
                    <div class="result-answer correct">
                        <strong>Correct Answer:</strong> ${question.correctAnswer}
                    </div>
                ` : ''}
            `;

            detailedResults.appendChild(resultElement);
        });
    }

    // Helper function to update processing message
    function updateProcessingMessage(message) {
        const processingSection = document.getElementById('processingSection');
        const messageElement = processingSection.querySelector('p');
        if (messageElement) {
            messageElement.textContent = message;
        }
    }

    // Add timeout warning for long operations
    function showTimeoutWarning() {
        setTimeout(() => {
            const processingSection = document.getElementById('processingSection');
            if (!processingSection.classList.contains('hidden')) {
                updateProcessingMessage('This is taking longer than usual. Please wait...');
            }
        }, 10000); // Show warning after 10 seconds

        setTimeout(() => {
            const processingSection = document.getElementById('processingSection');
            if (!processingSection.classList.contains('hidden')) {
                updateProcessingMessage('Still processing... Large content may take up to 2 minutes.');
            }
        }, 30000); // Show extended warning after 30 seconds
    }

    // Theme toggle functionality
    function initializeTheme() {
        const themeToggle = document.getElementById('themeToggle');
        const savedTheme = localStorage.getItem('theme') || 'light';

        // Set initial theme
        document.documentElement.setAttribute('data-theme', savedTheme);
        updateThemeIcon(savedTheme);

        // Theme toggle event listener
        themeToggle.addEventListener('click', function() {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';

            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);

            // Add animation effect
            themeToggle.style.transform = 'rotate(360deg)';
            setTimeout(() => {
                themeToggle.style.transform = '';
            }, 300);
        });
    }

    function updateThemeIcon(theme) {
        const themeToggle = document.getElementById('themeToggle');
        const icon = themeToggle.querySelector('i');

        if (theme === 'dark') {
            icon.className = 'fas fa-sun';
        } else {
            icon.className = 'fas fa-moon';
        }
    }

    // Tab switching functionality
    function initializeTabs() {
        const tabButtons = document.querySelectorAll('.tab-btn');
        const tabPanes = document.querySelectorAll('.tab-pane');

        tabButtons.forEach(button => {
            button.addEventListener('click', function() {
                const targetTab = this.dataset.tab;

                // Remove active class from all buttons and panes
                tabButtons.forEach(btn => btn.classList.remove('active'));
                tabPanes.forEach(pane => pane.classList.remove('active'));

                // Add active class to clicked button and corresponding pane
                this.classList.add('active');
                document.getElementById(targetTab + 'Tab').classList.add('active');
            });
        });
    }

    // File upload drag and drop
    function initializeFileUpload() {
        const fileUploadArea = document.getElementById('fileUploadArea');
        const fileInput = document.getElementById('contentFile');

        if (fileUploadArea) {
            fileUploadArea.addEventListener('dragover', function(e) {
                e.preventDefault();
                this.classList.add('dragover');
            });

            fileUploadArea.addEventListener('dragleave', function(e) {
                e.preventDefault();
                this.classList.remove('dragover');
            });

            fileUploadArea.addEventListener('drop', function(e) {
                e.preventDefault();
                this.classList.remove('dragover');

                const files = e.dataTransfer.files;
                fileInput.files = files;

                // Update UI to show selected files
                updateFileDisplay(files);
            });

            fileUploadArea.addEventListener('click', function() {
                fileInput.click();
            });

            fileInput.addEventListener('change', function() {
                updateFileDisplay(this.files);
            });
        }
    }

    function updateFileDisplay(files) {
        const fileUploadArea = document.getElementById('fileUploadArea');
        const uploadText = fileUploadArea.querySelector('.upload-text');

        if (files.length > 0) {
            const fileNames = Array.from(files).map(file => file.name).join(', ');
            uploadText.innerHTML = `
                <h3>Files Selected</h3>
                <p>${fileNames}</p>
            `;
        }
    }

    // Initialize question count functionality
    function initializeQuestionCount() {
        const presetButtons = document.querySelectorAll('.question-preset');
        const customInput = document.getElementById('customQuestionCount');

        // Handle preset button clicks
        presetButtons.forEach(button => {
            button.addEventListener('click', function() {
                // Remove active class from all buttons
                presetButtons.forEach(btn => btn.classList.remove('active'));
                // Add active class to clicked button
                this.classList.add('active');
                // Clear custom input
                customInput.value = '';
            });
        });

        // Handle custom input
        customInput.addEventListener('input', function() {
            if (this.value) {
                // Remove active class from all preset buttons
                presetButtons.forEach(btn => btn.classList.remove('active'));

                // Validate input range
                const value = parseInt(this.value);
                if (value < 1) {
                    this.style.borderColor = '#ef4444';
                    this.style.color = '#ef4444';
                } else if (value > 100) {
                    this.style.borderColor = '#f59e0b';
                    this.style.color = '#f59e0b';
                } else {
                    this.style.borderColor = '#10b981';
                    this.style.color = 'var(--text-primary)';
                }
            } else {
                this.style.borderColor = 'var(--border-color)';
                this.style.color = 'var(--text-primary)';
            }
        });

        // Clear custom input when clicking outside
        customInput.addEventListener('blur', function() {
            if (!this.value) {
                // If no custom value, reactivate the first preset
                presetButtons[0].classList.add('active');
            }
        });
    }

    // Get selected question count
    function getSelectedQuestionCount() {
        const customInput = document.getElementById('customQuestionCount');
        const activePreset = document.querySelector('.question-preset.active');

        // Check if custom input has a value
        if (customInput.value && customInput.value.trim() !== '') {
            const customCount = parseInt(customInput.value);
            if (customCount >= 1) {
                // Show warning for large numbers but allow them
                if (customCount > 100) {
                    showNotification(`Generating ${customCount} questions may take longer. Please be patient.`, 'info');
                }
                return customCount;
            } else {
                // Show error for invalid range
                showNotification('Please enter a number of 1 or greater for custom question count.', 'error');
                return null;
            }
        }

        // Fall back to active preset or default
        if (activePreset) {
            return parseInt(activePreset.dataset.count);
        }

        return 5; // Default fallback
    }

    // Quiz loading animation
    function startQuizLoadingAnimation() {
        const steps = ['step1', 'step2', 'step3'];
        const texts = [
            'Analyzing content and extracting key concepts...',
            'AI is processing and understanding the material...',
            'Generating personalized questions for you...'
        ];

        let currentStep = 0;

        // Reset all steps
        steps.forEach(stepId => {
            const step = document.getElementById(stepId);
            step.classList.remove('active', 'completed');
        });

        // Start with first step
        document.getElementById('step1').classList.add('active');
        document.getElementById('quizLoadingText').textContent = texts[0];

        const interval = setInterval(() => {
            if (currentStep < steps.length - 1) {
                // Mark current step as completed
                document.getElementById(steps[currentStep]).classList.remove('active');
                document.getElementById(steps[currentStep]).classList.add('completed');

                // Move to next step
                currentStep++;
                document.getElementById(steps[currentStep]).classList.add('active');
                document.getElementById('quizLoadingText').textContent = texts[currentStep];
            } else {
                // All steps completed, clear interval
                clearInterval(interval);
            }
        }, 1500); // Change step every 1.5 seconds

        // Store interval ID to clear it if needed
        window.quizLoadingInterval = interval;
    }

    // Show notification function
    function showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <span class="notification-message">${message}</span>
                <button class="notification-close">&times;</button>
            </div>
        `;

        // Add to page
        document.body.appendChild(notification);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);

        // Manual close
        notification.querySelector('.notification-close').addEventListener('click', () => {
            notification.remove();
        });
    }

    // Initialize all enhanced features
    initializeTabs();
    initializeFileUpload();
});
