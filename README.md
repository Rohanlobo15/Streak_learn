# 🚀 Streak Learn

![Streak Learn Banner](public/logo512.png)

[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](https://github.com/your-repo)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-18-blue?logo=react)](https://reactjs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Enabled-yellow?logo=firebase)](https://firebase.google.com/)

---

## 📚 Project Overview

**Streak Learn** is a modern learning management platform built with React and Firebase. It features:
- Real-time messaging
- Posts and announcements
- Deadlines and calendar tracking
- File sharing
- User authentication

> _"Stay on track, keep your streak!"_

---

## 🖼️ Visual Overview

![Dashboard Screenshot](docs/dashboard_screenshot.png)

*Add screenshots or animated GIFs of your app here. For example:*
- Dashboard
- Messaging
- Calendar

---

## ✨ Features

- 🔒 **Authentication** (Email/Password via Firebase)
- 💬 **Real-time Messaging**
- 📝 **Posts & Announcements**
- 📅 **Streak Calendar & Deadlines**
- 📁 **File Sharing**
- 🔔 **Push Notifications**

---

## 🛠️ Setup Instructions

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/streak-learn.git
cd streak-learn
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Firebase Setup
- Go to [Firebase Console](https://console.firebase.google.com/) and create a new project.
- Enable **Authentication** (Email/Password), **Firestore**, **Storage**, and **Cloud Messaging**.
- For first-time setup, use test mode for Firestore and Storage.
- Download your Firebase config and **replace the credentials** in:
  - `src/firebase.js`
  - `src/services/NotificationService.js` (for messaging setup)

#### Example Firebase Config (src/firebase.js):
```js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};
```

### 4. Start the App
```bash
npm start
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Running Tests
```bash
npm test
```

---

## 📂 Project Structure

```
streak-learn/
  ├── public/
  ├── src/
  │   ├── components/    # UI Components (Dashboard, Messaging, Posts, etc.)
  │   ├── contexts/      # React Contexts (Auth, Theme)
  │   ├── services/      # Firebase Notification Service
  │   ├── utils/         # Utility scripts (Gemini API, tests)
  │   ├── firebase.js    # Firebase config
  │   └── App.js         # Main App
  └── ...
```

---

## 📸 Demo & Animations

*Add GIFs or images showing app features in action:*
- ![Messaging Demo](docs/messaging_demo.gif)
- ![Calendar Animation](docs/calendar_animation.gif)

---

## 🤝 Contributing

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 📬 Contact

For questions or support, open an issue or contact [your-email@example.com](mailto:your-email@example.com).

---

> _Happy Learning!_

