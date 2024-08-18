# 🌐 URL Metadata Fetcher

[![Netlify Status](https://api.netlify.com/api/v1/badges/22f29d3c-e231-402e-ae86-99a91a822780/deploy-status)](https://app.netlify.com/sites/react-node-url-mdata-fetch-dotanv/deploys)

## 📚 Table of Contents

- [Project Overview](#-project-overview)
- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Getting Started](#-getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Usage](#-usage)
- [API Reference](#-api-reference)
- [Testing](#-testing)
- [Deployment](#-deployment)
- [Security](#-security)
- [Contributing](#-contributing)
- [License](#-license)
- [Personal Note](#-personal-note)

## 🚀 Project Overview

URL Metadata Fetcher is a full-stack application designed to streamline the process of gathering metadata from multiple web pages. Users can input a list of URLs, and the application will fetch and display key metadata (title, description, and image) for each URL.

This project was developed as part of a junior developer home task/exam to showcase problem-solving skills, creativity, and understanding of key web development concepts.

## ✨ Features

- 📊 Fetch metadata (title, description, image) from multiple URLs simultaneously
- 🖼️ Display results in a visually appealing format
- 🛡️ Implement robust error handling for invalid URLs or failed requests
- 🚦 Rate limiting to prevent abuse
- 🔒 CSRF protection for enhanced security
- 📱 Responsive design for mobile and desktop
- 📥 Download results as CSV
- 📋 Copy results as JSON

## 🛠️ Tech Stack

### Backend

- 🟢 **Runtime**: Node.js
- 🚂 **Framework**: Express.js
- 🧪 **Testing**: Jest
- 🚥 **Rate Limiting**: Express-rate-limit
- 🌐 **HTTP Requests**: Fetch API (built into Node.js)
- 🔍 **HTML Parsing**: Cheerio
- 🛡️ **Security**:
  - Helmet
  - CORS
  - CSRF protection (csurf)
  - XSS protection (xss-clean)

### Frontend

- 🏗️ **Build Tool**: Vite
- ⚛️ **Library**: React
- 💅 **Styling**: Tailwind CSS
- 🌐 **HTTP Requests**: Axios
- 🧪 **Testing**: Vitest and React Testing Library
- 🚨 **Notifications**: React-Toastify
- 🔒 **Security**: DOMPurify for sanitizing HTML

### Development Tools

- 📚 **Version Control**: Git
- 📦 **Package Manager**: npm

## 🏁 Getting Started

### Prerequisites

- Node.js
- npm

### Installation

1. Clone the repository:

   ```sh
   git clone https://github.com/DotanVG/react-node-url-metadata-fetcher.git
   ```

2. Install backend dependencies:

   ```sh
   cd react-node-url-metadata-fetcher/Backend
   npm install
   ```

3. Install frontend dependencies:

   ```sh
   cd ../Frontend
   npm install
   ```

## 🖥️ Usage

1. Start the backend server:

   ```sh
   cd Backend
   npm start
   ```

   The server will run on `http://localhost:3000` by default.

2. In a new terminal, start the frontend development server:

   ```sh
   cd Frontend
   npm run dev
   ```

   The frontend will be available at `http://localhost:5173` by default.

3. Open your browser and navigate to `http://localhost:5173` to use the application.

## 📡 API Reference

### Fetch Metadata

- **URL**: `/fetch-metadata`
- **Method**: POST
- **Headers**:
  - `Content-Type: application/json`
  - `X-CSRF-Token: [CSRF_TOKEN]`
- **Body**:

  ```json
  {
    "urls": ["https://example.com", "https://another-example.com"]
  }
  ```

- **Response**: JSON object containing metadata for each URL

### Get CSRF Token

- **URL**: `/get-csrf-token`
- **Method**: GET
- **Response**: JSON object containing a CSRF token

## 🧪 Testing

### Backend Tests

```sh
cd Backend
npm test
```

### Frontend Tests

```sh
cd Frontend
npm test
```

## 🚀 Deployment

The application is deployed on the following URLs:

- [Frontend WebApp](https://react-node-url-mdata-fetch-dotanv.netlify.app/) 🌐
- [Backend API](https://react-node-url-metadata-fetcher.onrender.com/) Cannot GET / ✅
- [Live Demo on YouTube](https://www.youtube.com/watch?v=Xzy1IWOZq7A) 🎥

## 🔐 Security

- Rate limiting (5 requests per second)
- CSRF protection using csurf
- Input sanitization and output encoding to prevent Cross-Site Scripting (XSS) attacks
- HTTP security headers with Helmet middleware
- Strict Cross-Origin Resource Sharing (CORS) policy to control which domains can interact with the API

## 🤝 Contributing

This project is a home assignment and is not open for contributions.

## 📄 License

This project is created as part of a home assignment and does not have a specific license.

## 🙏 Personal Note

I would like to express my sincere gratitude to Tolstoy for providing this opportunity. This project has been an enriching experience that allowed me to showcase my skills and learn new ones.

Some key points about the development process:

1. Design Choices: I opted for a React frontend with Vite for fast development and Tailwind CSS for rapid styling. The Express backend was chosen for its simplicity and robustness.

2. Trade-offs: While implementing rate limiting and CSRF protection enhanced security, it added complexity to both frontend and backend. I believe this trade-off was necessary for a production-ready application.

3. Challenges: Integrating CORS and CSRF protection simultaneously presented some hurdles, but it led to a deeper understanding of web security practices.

4. Learnings: This project reinforced the importance of thorough documentation and testing, especially when dealing with security features and API integrations.

Thank you for this valuable learning opportunity. I look forward to any feedback you may have.

---

📌 **Note**: This project is designed to handle a minimum of 3 URLs for metadata fetching. Robust error handling is implemented for cases where metadata cannot be retrieved.
