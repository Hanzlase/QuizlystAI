# QUIZLYST AI

*Transform Any Content Into Learning Gold*

[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Express.js](https://img.shields.io/badge/Express.js-4.18+-blue.svg)](https://expressjs.com/)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow.svg)](https://developer.mozilla.org/en-US/docs/Web/JavaScript)
[![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black.svg)](https://vercel.com/)

## 🚀 Overview

Quizlyst AI is an intelligent learning platform that transforms any content source into comprehensive study materials. Upload documents, paste URLs, or share YouTube videos - our AI creates detailed notes, summaries, and interactive quizzes instantly.

## ✨ Features

- **📄 Multi-Format Support**: Process PDFs, DOCX, TXT files, web articles, and YouTube videos
- **🤖 AI-Powered Analysis**: Generate comprehensive study notes with proper markdown formatting
- **📝 Smart Summaries**: Create concise summaries that capture key concepts
- **🎯 Interactive Quizzes**: Generate multiple-choice quizzes with customizable difficulty levels
- **🌍 Multi-Language Support**: Translate content to multiple languages
- **⚡ Real-Time Processing**: Fast content extraction and AI analysis
- **📱 Responsive Design**: Works seamlessly on desktop and mobile devices

## 🛠️ Built With

![Express.js](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white)

### Core Technologies

- **Backend**: Express.js, Node.js
- **AI Integration**: OpenRouter API, Cohere API
- **Content Processing**: Cheerio, PDF-Parse, Mammoth, YouTube-Transcript
- **File Handling**: Multer
- **Deployment**: Vercel (Serverless)

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- API keys for OpenRouter and/or Cohere

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/quizlyst-ai.git
   cd quizlyst-ai
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Add your API keys to `.env`:
   ```env
   API_KEY=your_openrouter_api_key
   COHERE_KEY=your_cohere_api_key
   PORT=5000
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:5000`

## 📖 Usage

### Processing Content

1. **Choose Content Type**:
   - 📄 Upload documents (PDF, DOCX, TXT)
   - 🔗 Paste web article URLs
   - 📺 Share YouTube video links

2. **Select Note Style**:
   - Easy Wording: Simplified explanations
   - Custom Mode: Personalized instructions

3. **Generate Materials**:
   - Detailed study notes with markdown formatting
   - Concise summaries
   - Interactive quizzes with multiple difficulty levels

### API Endpoints

```javascript
// Process URL content
POST /api/content/process
{
  "url": "https://example.com",
  "type": "link",
  "mode": "simple",
  "customPrompt": "Explain like I'm 5"
}

// Upload file (local only)
POST /api/content/upload
// FormData with file and options

// Generate quiz
POST /api/quiz/generate
{
  "difficulty": "medium",
  "questionCount": 10
}
```

## 🏗️ Project Structure

```
quizlyst-ai/
├── public/
│   ├── css/
│   │   └── home.css
│   ├── js/
│   │   └── home.js
│   └── home.html
├── uploads/           # Temporary file storage (local only)
├── server.js          # Main server file
├── package.json
├── vercel.json        # Vercel deployment config
└── README.md
```

## 🌐 Deployment

### Vercel (Recommended)

1. **Connect to Vercel**:
   ```bash
   npm i -g vercel
   vercel
   ```

2. **Set environment variables** in Vercel dashboard:
   - `API_KEY`: Your OpenRouter API key
   - `COHERE_KEY`: Your Cohere API key

3. **Deploy**:
   ```bash
   vercel --prod
   ```

### Local Development

```bash
npm run dev    # Development with nodemon
npm start      # Production mode
```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `API_KEY` | OpenRouter API key | Yes |
| `COHERE_KEY` | Cohere API key | Optional (fallback) |
| `PORT` | Server port | No (default: 5000) |
| `VERCEL` | Vercel environment flag | Auto-set |

### Supported File Types

- **Documents**: PDF, DOCX, TXT (up to 10MB)
- **Web Content**: Articles, blog posts, documentation
- **Videos**: YouTube videos with captions/subtitles

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- OpenRouter for AI model access
- Cohere for fallback AI capabilities
- Vercel for seamless deployment
- All open-source contributors

## 📞 Support

- 📧 Email: support@quizlyst.ai
- 🐛 Issues: [GitHub Issues](https://github.com/yourusername/quizlyst-ai/issues)
- 📖 Documentation: [Wiki](https://github.com/yourusername/quizlyst-ai/wiki)

---

<div align="center">
  <strong>Made with ❤️ for learners everywhere</strong>
</div>

