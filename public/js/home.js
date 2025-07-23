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
        animateContentProcessingSteps();
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
                // Clear content processing animation
                if (window.contentProcessingInterval) {
                    clearInterval(window.contentProcessingInterval);
                }

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

            // Clear content processing animation
            if (window.contentProcessingInterval) {
                clearInterval(window.contentProcessingInterval);
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
        animateContentProcessingSteps();
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

            // Clear content processing animation
            if (window.contentProcessingInterval) {
                clearInterval(window.contentProcessingInterval);
            }

            displayNotes(allNotes, combinedSummary);
            processingSection.classList.add('hidden');
            notesSection.classList.remove('hidden');

            console.log(`✅ Successfully processed all ${files.length} file(s)`);

        } catch (error) {
            console.error('Error:', error);

            // Clear content processing animation
            if (window.contentProcessingInterval) {
                clearInterval(window.contentProcessingInterval);
            }

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
        animateContentProcessingSteps();
        
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
                // Clear content processing animation
                if (window.contentProcessingInterval) {
                    clearInterval(window.contentProcessingInterval);
                }

                displayNotes(data.notes, data.summary);
                processingSection.classList.add('hidden');
            } else {
                throw new Error(data.message || 'Failed to regenerate notes');
            }
        } catch (error) {
            console.error('Error:', error);

            // Clear content processing animation
            if (window.contentProcessingInterval) {
                clearInterval(window.contentProcessingInterval);
            }

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
        const formattedNotes = formatNotes(notes);
        const formattedSummary = formatSummary(summary);

        document.getElementById('notesOutput').innerHTML = formattedNotes;
        document.getElementById('summaryOutput').innerHTML = formattedSummary;

        // Store original content for translation
        if (window.translationState) {
            window.translationState.notes.original = formattedNotes;
            window.translationState.summary.original = formattedSummary;

            // Reset translation states
            window.translationState.notes.currentLanguage = 'en';
            window.translationState.summary.currentLanguage = 'en';

            // Reset language selectors
            const notesSelect = document.getElementById('notesLanguageSelect');
            if (notesSelect) notesSelect.value = 'en';

            // Update language indicators
            updateLanguageIndicator('notes', 'en', 'English (Original)');
            updateLanguageIndicator('summary', 'en', 'English (Original)');

            // Show original content
            showOriginalNotes();
            showOriginalSummary();
        }
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

        // Store original quiz for translation
        if (window.translationState) {
            window.translationState.quiz.original = quiz;
            window.translationState.quiz.currentLanguage = 'en';

            // Reset quiz language selector
            const quizSelect = document.getElementById('quizLanguageSelect');
            if (quizSelect) quizSelect.value = 'en';
        }

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

        // Check if mobile device
        const isMobile = window.innerWidth <= 768;

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
                    cutout: isMobile ? '65%' : '70%'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                devicePixelRatio: window.devicePixelRatio || 1,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            padding: isMobile ? 10 : 20,
                            usePointStyle: true,
                            font: {
                                size: isMobile ? 11 : 12
                            },
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-primary')
                        }
                    }
                },
                layout: {
                    padding: {
                        top: isMobile ? 5 : 10,
                        bottom: isMobile ? 5 : 10,
                        left: isMobile ? 5 : 10,
                        right: isMobile ? 5 : 10
                    }
                }
            }
        });

        // Force resize after creation for mobile
        if (isMobile) {
            setTimeout(() => {
                window.resultsChartInstance.resize();
            }, 100);
        }
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
        const processingText = document.getElementById('processingText');
        if (processingText) {
            processingText.textContent = message;
        }
    }

    // Enhanced processing steps animation for content processing
    function animateContentProcessingSteps() {
        const steps = ['contentStep1', 'contentStep2', 'contentStep3'];
        const texts = [
            'Extracting content...',
            'AI analysis...',
            'Generating notes...'
        ];

        let currentStep = 0;

        // Reset all steps
        steps.forEach(stepId => {
            const step = document.getElementById(stepId);
            if (step) {
                step.classList.remove('active', 'completed');
            }
        });

        // Start with first step
        const firstStep = document.getElementById('contentStep1');
        if (firstStep) {
            firstStep.classList.add('active');
        }
        updateProcessingMessage(texts[0]);

        const interval = setInterval(() => {
            if (currentStep < steps.length - 1) {
                // Mark current step as completed
                const currentStepElement = document.getElementById(steps[currentStep]);
                if (currentStepElement) {
                    currentStepElement.classList.remove('active');
                    currentStepElement.classList.add('completed');
                }

                // Move to next step
                currentStep++;
                const nextStepElement = document.getElementById(steps[currentStep]);
                if (nextStepElement) {
                    nextStepElement.classList.add('active');
                }
                updateProcessingMessage(texts[currentStep]);
            } else {
                // All steps completed, clear interval
                clearInterval(interval);
            }
        }, 2000); // Change step every 2 seconds

        // Store interval reference for cleanup
        window.contentProcessingInterval = interval;
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
        // The new theme toggle uses CSS transitions and data-theme attribute
        // No need to manually update icons as they're handled by CSS
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

    // Handle window resize for chart responsiveness
    let resizeTimeout;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(function() {
            if (window.resultsChartInstance) {
                window.resultsChartInstance.resize();
            }
        }, 250);
    });

    // Translation functionality
    initializeTranslation();
});

// Translation Management
function initializeTranslation() {
    // Enhanced language data with flags and more languages
    const languages = [
        { code: 'en', name: 'English (Original)', flag: '🇺🇸', native: 'English' },
        { code: 'ur', name: 'Urdu', flag: '🇵🇰', native: 'اردو' },
        { code: 'hi', name: 'Hindi', flag: '🇮🇳', native: 'हिन्दी' },
        { code: 'ar', name: 'Arabic', flag: '🇸🇦', native: 'العربية' },
        { code: 'zh', name: 'Chinese', flag: '🇨🇳', native: '中文' },
        { code: 'es', name: 'Spanish', flag: '🇪🇸', native: 'Español' },
        { code: 'fr', name: 'French', flag: '🇫🇷', native: 'Français' },
        { code: 'de', name: 'German', flag: '🇩🇪', native: 'Deutsch' },
        { code: 'it', name: 'Italian', flag: '🇮🇹', native: 'Italiano' },
        { code: 'pt', name: 'Portuguese', flag: '🇵🇹', native: 'Português' },
        { code: 'ru', name: 'Russian', flag: '🇷🇺', native: 'Русский' },
        { code: 'ja', name: 'Japanese', flag: '🇯🇵', native: '日本語' },
        { code: 'ko', name: 'Korean', flag: '🇰🇷', native: '한국어' },
        { code: 'tr', name: 'Turkish', flag: '🇹🇷', native: 'Türkçe' },
        { code: 'nl', name: 'Dutch', flag: '🇳🇱', native: 'Nederlands' },
        { code: 'sv', name: 'Swedish', flag: '🇸🇪', native: 'Svenska' },
        { code: 'da', name: 'Danish', flag: '🇩🇰', native: 'Dansk' },
        { code: 'no', name: 'Norwegian', flag: '🇳🇴', native: 'Norsk' },
        { code: 'fi', name: 'Finnish', flag: '🇫🇮', native: 'Suomi' },
        { code: 'pl', name: 'Polish', flag: '🇵🇱', native: 'Polski' },
        { code: 'cs', name: 'Czech', flag: '🇨🇿', native: 'Čeština' },
        { code: 'sk', name: 'Slovak', flag: '🇸🇰', native: 'Slovenčina' },
        { code: 'hu', name: 'Hungarian', flag: '🇭🇺', native: 'Magyar' },
        { code: 'ro', name: 'Romanian', flag: '🇷🇴', native: 'Română' },
        { code: 'bg', name: 'Bulgarian', flag: '🇧🇬', native: 'Български' },
        { code: 'hr', name: 'Croatian', flag: '🇭🇷', native: 'Hrvatski' },
        { code: 'sr', name: 'Serbian', flag: '🇷🇸', native: 'Српски' },
        { code: 'sl', name: 'Slovenian', flag: '🇸🇮', native: 'Slovenščina' },
        { code: 'et', name: 'Estonian', flag: '🇪🇪', native: 'Eesti' },
        { code: 'lv', name: 'Latvian', flag: '🇱🇻', native: 'Latviešu' },
        { code: 'lt', name: 'Lithuanian', flag: '🇱🇹', native: 'Lietuvių' },
        { code: 'el', name: 'Greek', flag: '🇬🇷', native: 'Ελληνικά' },
        { code: 'he', name: 'Hebrew', flag: '🇮🇱', native: 'עברית' },
        { code: 'th', name: 'Thai', flag: '🇹🇭', native: 'ไทย' },
        { code: 'vi', name: 'Vietnamese', flag: '🇻🇳', native: 'Tiếng Việt' },
        { code: 'id', name: 'Indonesian', flag: '🇮🇩', native: 'Bahasa Indonesia' },
        { code: 'ms', name: 'Malay', flag: '🇲🇾', native: 'Bahasa Melayu' },
        { code: 'tl', name: 'Filipino', flag: '🇵🇭', native: 'Filipino' },
        { code: 'sw', name: 'Swahili', flag: '🇰🇪', native: 'Kiswahili' },
        { code: 'am', name: 'Amharic', flag: '🇪🇹', native: 'አማርኛ' },
        { code: 'bn', name: 'Bengali', flag: '🇧🇩', native: 'বাংলা' },
        { code: 'ta', name: 'Tamil', flag: '🇮🇳', native: 'தமிழ்' },
        { code: 'te', name: 'Telugu', flag: '🇮🇳', native: 'తెలుగు' },
        { code: 'ml', name: 'Malayalam', flag: '🇮🇳', native: 'മലയാളം' },
        { code: 'kn', name: 'Kannada', flag: '🇮🇳', native: 'ಕನ್ನಡ' },
        { code: 'gu', name: 'Gujarati', flag: '🇮🇳', native: 'ગુજરાતી' },
        { code: 'pa', name: 'Punjabi', flag: '🇮🇳', native: 'ਪੰਜਾਬੀ' },
        { code: 'mr', name: 'Marathi', flag: '🇮🇳', native: 'मराठी' },
        { code: 'ne', name: 'Nepali', flag: '🇳🇵', native: 'नेपाली' },
        { code: 'si', name: 'Sinhala', flag: '🇱🇰', native: 'සිංහල' },
        { code: 'my', name: 'Myanmar', flag: '🇲🇲', native: 'မြန်မာ' },
        { code: 'km', name: 'Khmer', flag: '🇰🇭', native: 'ខ្មែរ' },
        { code: 'lo', name: 'Lao', flag: '🇱🇦', native: 'ລາວ' }
    ];

    // Create language name mapping for backward compatibility
    const languageNames = {};
    languages.forEach(lang => {
        languageNames[lang.code] = lang.name;
    });

    // Initialize language dropdowns
    initializeLanguageDropdown('notes', languages);
    initializeLanguageDropdown('quiz', languages);

    const translateNotesBtn = document.getElementById('translateNotesBtn');
    const translateQuizBtn = document.getElementById('translateQuizBtn');

    // Store languages globally for access
    window.translationLanguages = languages;
    window.languageNames = languageNames;

    // Translation state
    window.translationState = {
        notes: {
            original: '',
            translated: {},
            currentLanguage: 'en'
        },
        summary: {
            original: '',
            translated: {},
            currentLanguage: 'en'
        },
        quiz: {
            original: null,
            translated: {},
            currentLanguage: 'en'
        }
    };

    // Translation button event listeners
    translateNotesBtn.addEventListener('click', async function() {
        const currentLang = getCurrentLanguage('notes');
        console.log('Translate button clicked, current language:', currentLang);

        if (currentLang === 'en') {
            console.log('Language is English, no translation needed');
            return;
        }

        // Test translation API first with a simple phrase
        try {
            console.log('Testing translation API...');
            const testResult = await translateText('Hello world', currentLang);
            console.log('Test translation result:', testResult);

            if (testResult === 'Hello world') {
                showNotification('Translation service is not responding. Please try again later.', 'warning');
                return;
            }
        } catch (error) {
            console.error('Translation test failed:', error);
            showNotification('Translation service is unavailable. Please try again later.', 'error');
            return;
        }

        // Translate both notes and summary
        try {
            console.log('Starting translation to:', currentLang, languageNames[currentLang]);
            await translateContent('notes', currentLang, languageNames[currentLang]);
            await translateContent('summary', currentLang, languageNames[currentLang]);
        } catch (error) {
            console.error('Translation failed:', error);
            showNotification('Translation failed: ' + error.message, 'error');
        }
    });

    translateQuizBtn.addEventListener('click', async function() {
        const currentLang = getCurrentLanguage('quiz');
        if (currentLang === 'en') return;

        await translateQuiz(currentLang, languageNames[currentLang]);
    });
}

// Helper function to get current selected language
function getCurrentLanguage(type) {
    const selected = document.getElementById(`${type}LanguageSelected`);
    const languageName = selected.querySelector('.language-name').textContent;

    // Find language code by name
    const language = window.translationLanguages.find(lang => lang.name === languageName);
    return language ? language.code : 'en';
}

// Initialize language dropdown with search functionality
function initializeLanguageDropdown(type, languages) {
    const dropdown = document.getElementById(`${type}LanguageDropdown`);
    const selected = document.getElementById(`${type}LanguageSelected`);
    const options = document.getElementById(`${type}LanguageOptions`);
    const search = document.getElementById(`${type}LanguageSearch`);
    const list = document.getElementById(`${type}LanguageList`);

    let currentLanguage = 'en';

    // Populate language list
    function populateLanguages(filteredLanguages = languages) {
        list.innerHTML = '';
        filteredLanguages.forEach(lang => {
            const option = document.createElement('div');
            option.className = `language-option ${lang.code === currentLanguage ? 'selected' : ''}`;
            option.dataset.code = lang.code;
            option.innerHTML = `
                <span class="flag">${lang.flag}</span>
                <span class="language-name">${lang.name}</span>
                <span class="language-code">${lang.code}</span>
            `;

            option.addEventListener('click', () => {
                selectLanguage(lang);
                closeDropdown();
            });

            list.appendChild(option);
        });
    }

    // Select language
    function selectLanguage(lang) {
        currentLanguage = lang.code;
        selected.innerHTML = `
            <span class="flag">${lang.flag}</span>
            <span class="language-name">${lang.name}</span>
            <i class="fas fa-chevron-down"></i>
        `;

        // Update translate button state
        const translateBtn = document.getElementById(`translate${type.charAt(0).toUpperCase() + type.slice(1)}Btn`);
        translateBtn.disabled = lang.code === 'en';

        // Handle language change
        handleLanguageChange(type, lang.code, lang.name);

        // Update selected option in list
        list.querySelectorAll('.language-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.code === lang.code);
        });
    }

    // Open/close dropdown
    function toggleDropdown() {
        dropdown.classList.toggle('open');
        if (dropdown.classList.contains('open')) {
            search.focus();
        }
    }

    function closeDropdown() {
        dropdown.classList.remove('open');
        search.value = '';
        populateLanguages();
    }

    // Search functionality
    search.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = languages.filter(lang =>
            lang.name.toLowerCase().includes(query) ||
            lang.native.toLowerCase().includes(query) ||
            lang.code.toLowerCase().includes(query)
        );
        populateLanguages(filtered);
    });

    // Event listeners
    selected.addEventListener('click', toggleDropdown);

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target)) {
            closeDropdown();
        }
    });

    // Initialize
    populateLanguages();
}

// Handle language change
function handleLanguageChange(type, languageCode, languageName) {
    if (languageCode === 'en') {
        if (type === 'notes') {
            showOriginalNotes();
            showOriginalSummary();
        } else if (type === 'quiz') {
            showOriginalQuiz();
        }
    } else {
        // Show translated content if available
        if (type === 'notes') {
            if (window.translationState.notes.translated[languageCode]) {
                showTranslatedNotes(languageCode);
            } else {
                showOriginalNotes();
            }

            if (window.translationState.summary.translated[languageCode]) {
                showTranslatedSummary(languageCode);
            } else {
                showOriginalSummary();
            }
        } else if (type === 'quiz') {
            if (window.translationState.quiz.translated[languageCode]) {
                showTranslatedQuiz(languageCode);
            } else {
                showOriginalQuiz();
            }
        }
    }

    // Update language indicators
    if (type === 'notes') {
        updateLanguageIndicator('notes', languageCode, languageName);
        updateLanguageIndicator('summary', languageCode, languageName);
    }
}

// Translation API function with multiple fallbacks
async function translateText(text, targetLang) {
    // Skip translation for very short text or single characters
    if (!text || text.trim().length < 2) {
        return text;
    }

    try {
        console.log(`Translating: "${text.substring(0, 50)}..." to ${targetLang}`);

        // Try Google Translate (most reliable)
        const googleResult = await tryGoogleTranslation(text, targetLang);
        if (googleResult) {
            console.log('Translation successful via Google Translate');
            return googleResult;
        }

        // Try MyMemory API as fallback
        const result = await tryMyMemoryTranslation(text, targetLang);
        if (result) {
            console.log('Translation successful via MyMemory');
            return result;
        }

        // Try LibreTranslate as last resort
        const libreResult = await tryLibreTranslation(text, targetLang);
        if (libreResult) {
            console.log('Translation successful via LibreTranslate');
            return libreResult;
        }

        // Try basic offline translation for common words
        const offlineResult = tryOfflineTranslation(text, targetLang);
        if (offlineResult && offlineResult !== text) {
            console.log('Translation successful via offline dictionary');
            return offlineResult;
        }

        // If all APIs fail, return original text
        console.warn('All translation APIs failed, returning original text');
        return text;

    } catch (error) {
        console.error('Translation error:', error);
        return text; // Return original text instead of error message
    }
}

// Google Translate (free, no API key needed)
async function tryGoogleTranslation(text, targetLang) {
    try {
        // Using Google Translate's public endpoint
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${targetLang}&dt=t&q=${encodeURIComponent(text)}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        // Google Translate returns an array structure
        if (data && data[0] && data[0][0] && data[0][0][0]) {
            const translated = data[0][0][0].trim();
            if (translated && translated !== text) {
                return translated;
            }
        }

        return null;
    } catch (error) {
        console.warn('Google Translate failed:', error);
        return null;
    }
}

// MyMemory API translation
async function tryMyMemoryTranslation(text, targetLang) {
    try {
        const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|${targetLang}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.responseStatus === 200 && data.responseData && data.responseData.translatedText) {
            const translated = data.responseData.translatedText.trim();
            // Check if translation is meaningful (not just returning the original)
            if (translated && translated !== text && !translated.includes('MYMEMORY WARNING')) {
                return translated;
            }
        }

        return null;
    } catch (error) {
        console.warn('MyMemory translation failed:', error);
        return null;
    }
}

// LibreTranslate API translation (free, self-hosted instances available)
async function tryLibreTranslation(text, targetLang) {
    try {
        // Map language codes for LibreTranslate compatibility
        const langMap = {
            'hi': 'hi',    // Hindi
            'ur': 'ur',    // Urdu (if supported)
            'es': 'es',    // Spanish
            'fr': 'fr',    // French
            'de': 'de',    // German
            'it': 'it',    // Italian
            'pt': 'pt',    // Portuguese
            'ru': 'ru',    // Russian
            'ja': 'ja',    // Japanese
            'ko': 'ko',    // Korean
            'zh': 'zh',    // Chinese
            'ar': 'ar',    // Arabic
        };

        const mappedLang = langMap[targetLang] || targetLang;

        // Using a public LibreTranslate instance
        const url = 'https://libretranslate.de/translate';

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                q: text,
                source: 'en',
                target: mappedLang,
                format: 'text'
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.translatedText && data.translatedText.trim()) {
            return data.translatedText.trim();
        }

        return null;
    } catch (error) {
        console.warn('LibreTranslate translation failed:', error);
        return null;
    }
}

// Basic offline translation for common words (fallback)
function tryOfflineTranslation(text, targetLang) {
    // Basic dictionary for common educational terms
    const dictionaries = {
        'ur': { // Urdu
            'Introduction': 'تعارف',
            'Summary': 'خلاصہ',
            'Notes': 'نوٹس',
            'Quiz': 'کوئز',
            'Question': 'سوال',
            'Answer': 'جواب',
            'True': 'درست',
            'False': 'غلط',
            'Correct': 'صحیح',
            'Incorrect': 'غلط',
            'Score': 'اسکور',
            'Result': 'نتیجہ',
            'Chapter': 'باب',
            'Topic': 'موضوع',
            'Content': 'مواد',
            'Learning': 'سیکھنا',
            'Study': 'مطالعہ',
            'Education': 'تعلیم',
            'Knowledge': 'علم',
            'Information': 'معلومات'
        },
        'hi': { // Hindi
            'Introduction': 'परिचय',
            'Summary': 'सारांश',
            'Notes': 'नोट्स',
            'Quiz': 'प्रश्नोत्तरी',
            'Question': 'प्रश्न',
            'Answer': 'उत्तर',
            'True': 'सत्य',
            'False': 'असत्य',
            'Correct': 'सही',
            'Incorrect': 'गलत',
            'Score': 'अंक',
            'Result': 'परिणाम',
            'Chapter': 'अध्याय',
            'Topic': 'विषय',
            'Content': 'सामग्री',
            'Learning': 'सीखना',
            'Study': 'अध्ययन',
            'Education': 'शिक्षा',
            'Knowledge': 'ज्ञान',
            'Information': 'जानकारी'
        }
    };

    const dictionary = dictionaries[targetLang];
    if (!dictionary) {
        return null;
    }

    // Check if the text is a single word in our dictionary
    const trimmedText = text.trim();
    if (dictionary[trimmedText]) {
        return dictionary[trimmedText];
    }

    // Try to translate individual words in the text
    const words = trimmedText.split(/\s+/);
    if (words.length <= 3) { // Only for short phrases
        const translatedWords = words.map(word => {
            const cleanWord = word.replace(/[^\w]/g, ''); // Remove punctuation
            return dictionary[cleanWord] || word;
        });

        const result = translatedWords.join(' ');
        if (result !== trimmedText) {
            return result;
        }
    }

    return null;
}

// Translate content (notes/summary) with improved formatting preservation
async function translateContent(type, targetLang, languageName) {
    console.log(`Starting translation for ${type} to ${targetLang} (${languageName})`);

    const translateBtn = document.getElementById('translateNotesBtn'); // Use notes button for both
    const originalContent = type === 'notes' ?
        document.getElementById('notesOutput').innerHTML :
        document.getElementById('summaryOutput').innerHTML;

    console.log(`Original content length: ${originalContent.length}`);

    if (!originalContent.trim()) {
        console.log('No content to translate');
        showNotification('No content to translate', 'warning');
        return;
    }

    // Show loading state
    translateBtn.classList.add('loading');
    translateBtn.disabled = true;

    // Show progress notification
    showNotification(`Translating ${type} to ${languageName}...`, 'info');

    try {
        console.log('Starting HTML content translation...');
        // Parse HTML content and preserve structure
        const translatedHTML = await translateHTMLContent(originalContent, targetLang);

        console.log(`Translation completed, storing result for ${type}`);
        // Store translation
        window.translationState[type].translated[targetLang] = translatedHTML;
        window.translationState[type].currentLanguage = targetLang;

        // Show translated content
        if (type === 'notes') {
            showTranslatedNotes(targetLang);
        } else {
            showTranslatedSummary(targetLang);
        }

        updateLanguageIndicator(type, targetLang, languageName);
        showNotification(`${type.charAt(0).toUpperCase() + type.slice(1)} translated to ${languageName} successfully!`, 'success');

    } catch (error) {
        console.error('Translation failed:', error);
        showNotification(`Translation to ${languageName} failed. Please try again.`, 'error');

        // Reset to original language
        updateLanguageIndicator(type, 'en', 'English (Original)');
    } finally {
        translateBtn.classList.remove('loading');
        translateBtn.disabled = false;
    }
}

// Enhanced HTML content translation with structure preservation
async function translateHTMLContent(htmlContent, targetLang) {
    console.log('Parsing HTML content for translation...');
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
    const container = doc.querySelector('div');

    console.log('Starting element translation...');
    // Process each element recursively
    await translateElement(container, targetLang);

    console.log('HTML translation completed');
    return container.innerHTML;
}

async function translateElement(element, targetLang) {
    let translatedCount = 0;
    const textNodes = [];

    // Collect all text nodes first
    function collectTextNodes(node) {
        for (const child of Array.from(node.childNodes)) {
            if (child.nodeType === Node.TEXT_NODE) {
                const text = child.textContent.trim();
                if (text && text.length > 2) {
                    textNodes.push(child);
                }
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                collectTextNodes(child);
            }
        }
    }

    collectTextNodes(element);
    console.log(`Found ${textNodes.length} text nodes to translate`);

    // Batch translate for better performance
    const batchSize = 5; // Translate 5 texts simultaneously

    for (let i = 0; i < textNodes.length; i += batchSize) {
        const batch = textNodes.slice(i, i + batchSize);
        console.log(`Translating batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(textNodes.length/batchSize)}`);

        // Translate batch in parallel
        const promises = batch.map(async (node) => {
            const text = node.textContent.trim();
            try {
                const translatedText = await translateText(text, targetLang);
                if (translatedText && translatedText !== text) {
                    node.textContent = translatedText;
                    return true;
                }
                return false;
            } catch (error) {
                console.warn('Failed to translate text:', text, error);
                return false;
            }
        });

        const results = await Promise.all(promises);
        translatedCount += results.filter(Boolean).length;

        // Very short delay between batches
        if (i + batchSize < textNodes.length) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
    }

    console.log(`Translation completed: ${translatedCount}/${textNodes.length} nodes translated`);
}

// Helper functions for translation
function splitTextIntoChunks(text, maxLength) {
    const chunks = [];
    const sentences = text.split(/[.!?]+/);
    let currentChunk = '';

    for (const sentence of sentences) {
        if ((currentChunk + sentence).length > maxLength && currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = sentence;
        } else {
            currentChunk += sentence + '.';
        }
    }

    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return chunks.filter(chunk => chunk.length > 0);
}

function formatTranslatedContent(text) {
    // Convert plain text back to formatted HTML
    return text.split('\n').map(line => {
        line = line.trim();
        if (!line) return '';

        // Handle bullet points
        if (line.startsWith('•') || line.startsWith('-')) {
            return `<li>${line.substring(1).trim()}</li>`;
        }

        // Handle numbered lists
        if (/^\d+\./.test(line)) {
            return `<li>${line.replace(/^\d+\.\s*/, '')}</li>`;
        }

        // Regular paragraphs
        return `<p>${line}</p>`;
    }).join('');
}

function showOriginalNotes() {
    const container = document.querySelector('#notesTab .content-container');
    const translatedSection = document.getElementById('notesTranslatedSection');

    container.classList.remove('has-translation');
    translatedSection.classList.add('hidden');
    window.translationState.notes.currentLanguage = 'en';
}

function showTranslatedNotes(language) {
    const translatedContent = window.translationState.notes.translated[language];
    if (translatedContent) {
        const container = document.querySelector('#notesTab .content-container');
        const translatedSection = document.getElementById('notesTranslatedSection');
        const translatedLabel = document.getElementById('notesTranslatedLabel');
        const languageInfo = window.translationLanguages.find(lang => lang.code === language);

        document.getElementById('notesOutputTranslated').innerHTML = translatedContent;
        translatedLabel.textContent = `Translated (${languageInfo ? languageInfo.name : language})`;

        container.classList.add('has-translation');
        translatedSection.classList.remove('hidden');
        window.translationState.notes.currentLanguage = language;
    }
}

function showOriginalSummary() {
    const container = document.querySelector('#summaryTab .content-container');
    const translatedSection = document.getElementById('summaryTranslatedSection');

    container.classList.remove('has-translation');
    translatedSection.classList.add('hidden');
    window.translationState.summary.currentLanguage = 'en';
}

function showTranslatedSummary(language) {
    const translatedContent = window.translationState.summary.translated[language];
    if (translatedContent) {
        const container = document.querySelector('#summaryTab .content-container');
        const translatedSection = document.getElementById('summaryTranslatedSection');
        const translatedLabel = document.getElementById('summaryTranslatedLabel');
        const languageInfo = window.translationLanguages.find(lang => lang.code === language);

        document.getElementById('summaryOutputTranslated').innerHTML = translatedContent;
        translatedLabel.textContent = `Translated (${languageInfo ? languageInfo.name : language})`;

        container.classList.add('has-translation');
        translatedSection.classList.remove('hidden');
        window.translationState.summary.currentLanguage = language;
    }
}

function updateLanguageIndicator(type, language, languageName) {
    const indicator = document.getElementById(`${type}LanguageIndicator`);
    if (indicator) {
        const span = indicator.querySelector('span');
        span.textContent = languageName;

        if (language !== 'en') {
            indicator.style.background = 'linear-gradient(135deg, rgba(99, 102, 241, 0.1), rgba(118, 75, 162, 0.1))';
            indicator.style.borderLeft = '3px solid var(--primary-color)';
        } else {
            indicator.style.background = 'var(--bg-tertiary)';
            indicator.style.borderLeft = 'none';
        }
    }
}

// Quiz translation functions
async function translateQuiz(targetLang, languageName) {
    const translateBtn = document.getElementById('translateQuizBtn');
    const currentQuiz = window.currentQuiz;

    if (!currentQuiz || currentQuiz.length === 0) {
        showNotification('No quiz to translate', 'warning');
        return;
    }

    translateBtn.classList.add('loading');
    translateBtn.disabled = true;

    try {
        const translatedQuiz = [];

        for (const question of currentQuiz) {
            const translatedQuestion = {
                ...question,
                question: await translateText(question.question, targetLang),
                options: [],
                correctAnswer: question.correctAnswer
            };

            // Translate options
            for (const option of question.options) {
                const translatedOption = await translateText(option, targetLang);
                translatedQuestion.options.push(translatedOption);

                // Update correct answer if this option was the correct one
                if (option === question.correctAnswer) {
                    translatedQuestion.correctAnswer = translatedOption;
                }

                await new Promise(resolve => setTimeout(resolve, 100));
            }

            translatedQuiz.push(translatedQuestion);
            await new Promise(resolve => setTimeout(resolve, 200));
        }

        // Store translated quiz
        window.translationState.quiz.translated[targetLang] = translatedQuiz;
        window.translationState.quiz.currentLanguage = targetLang;

        // Display translated quiz
        displayTranslatedQuiz(translatedQuiz, targetLang);
        showNotification(`Quiz translated to ${languageName}`, 'success');

    } catch (error) {
        console.error('Quiz translation failed:', error);
        showNotification('Quiz translation failed. Please try again.', 'error');

        // Reset to original language
        document.getElementById('quizLanguageSelect').value = 'en';
    } finally {
        translateBtn.classList.remove('loading');
        translateBtn.disabled = false;
    }
}

function showOriginalQuiz() {
    if (window.currentQuiz) {
        displayQuiz(window.currentQuiz, 'medium', window.currentQuiz.length);
        window.translationState.quiz.currentLanguage = 'en';
    }
}

function showTranslatedQuiz(language) {
    const translatedQuiz = window.translationState.quiz.translated[language];
    if (translatedQuiz) {
        displayTranslatedQuiz(translatedQuiz, language);
        window.translationState.quiz.currentLanguage = language;
    }
}

function displayTranslatedQuiz(quiz, language) {
    const quizContainer = document.getElementById('quizContainer');
    quizContainer.innerHTML = '';

    quiz.forEach((question, index) => {
        const questionElement = document.createElement('div');
        questionElement.className = 'quiz-question';
        questionElement.innerHTML = `
            <div class="question-header">
                <span class="question-number">Question ${index + 1} of ${quiz.length}</span>
            </div>
            <h3 class="question-text">${question.question}</h3>
            <div class="quiz-options-list">
                ${question.options.map((option, optIndex) => `
                    <div class="quiz-option-item">
                        <input type="radio" id="q${index}-${optIndex}" name="q${index}" value="${option}" data-question="${index}">
                        <label for="q${index}-${optIndex}">
                            <span class="option-letter">${String.fromCharCode(65 + optIndex)}.</span>
                            <span class="option-text">${option}</span>
                        </label>
                    </div>
                `).join('')}
            </div>
        `;
        quizContainer.appendChild(questionElement);
    });

    // Update current quiz reference for translated version
    window.currentQuiz = quiz;

    // Show submit button
    document.getElementById('submitQuizBtn').classList.remove('hidden');
}

// Notification system for translation feedback
function showNotification(message, type = 'info') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.translation-notification');
    existingNotifications.forEach(notification => notification.remove());

    // Create notification element
    const notification = document.createElement('div');
    notification.className = `translation-notification ${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <i class="fas ${getNotificationIcon(type)}"></i>
            <span>${message}</span>
            <button class="notification-close">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    // Add to page
    document.body.appendChild(notification);

    // Add event listener for close button
    notification.querySelector('.notification-close').addEventListener('click', () => {
        notification.remove();
    });

    // Auto remove after 5 seconds
    setTimeout(() => {
        if (notification.parentNode) {
            notification.remove();
        }
    }, 5000);

    // Animate in
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
}

function getNotificationIcon(type) {
    switch (type) {
        case 'success': return 'fa-check-circle';
        case 'error': return 'fa-exclamation-circle';
        case 'warning': return 'fa-exclamation-triangle';
        default: return 'fa-info-circle';
    }
}
