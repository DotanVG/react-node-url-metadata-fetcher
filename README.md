# 🌐 URL Metadata Fetcher

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

## 🚀 Project Overview

URL Metadata Fetcher is a full-stack application designed to streamline the process of gathering metadata from multiple web pages. Users can input a list of URLs, and the application will fetch and display key metadata (title, description, and image) for each URL.

This project was developed as part of a junior developer home task/exam to showcase problem-solving skills, creativity, and understanding of key web development concepts.

## ✨ Features

- 📊 Fetch metadata (title, description, image) from multiple URLs simultaneously
- 🖼️ Display results in a visually appealing format
- 🛡️ Implement robust error handling for invalid URLs or failed requests
- 🚦 Rate limiting to prevent abuse
- 🔒 CSRF protection for enhanced security

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

### Frontend
- 🏗️ **Build Tool**: Vite
- ⚛️ **Library**: React
- 💅 **Styling**: Tailwind CSS
- 🌐 **HTTP Requests**: Fetch API
- 🧪 **Testing**: Jest and React Testing Library

### Development Tools
- 📚 **Version Control**: Git
- 📦 **Package Manager**: npm

## 🏁 Getting Started

### Prerequisites

- Node.js (version specified in `package.json`)
- npm (usually comes with Node.js)

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

The application will be deployed on Netlify. The live demo link will be added here once deployment is complete.

## 🔐 Security

- CSRF protection using csurf
- Rate limiting (5 requests per second)
- HTTP security headers with Helmet middleware

## 🤝 Contributing

This project is a home assignment and is not open for contributions.

## 📄 License

This project is created as part of a home assignment and does not have a specific license.

---

📌 **Note**: This project is designed to handle a minimum of 3 URLs for metadata fetching. Robust error handling is implemented for cases where metadata cannot be retrieved.
