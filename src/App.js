import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import SignUp from './components/SignUp';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import Messaging from './components/Messaging';
import Files from './components/Files';
import Posts from './components/Posts';
import Deadlines from './components/Deadlines';
import { requestNotificationPermission, setupForegroundNotifications } from './services/NotificationService';
import './App.css';

// Wrapper component to initialize notifications after auth is loaded
function NotificationInitializer({ children }) {
  const { currentUser } = useAuth();

  useEffect(() => {
    if (currentUser) {
      // Request notification permission and set up foreground handlers
      requestNotificationPermission().then(token => {
        if (token) {
          setupForegroundNotifications();
        }
      });
    }
  }, [currentUser]);

  return <>{children}</>;
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <ThemeProvider>
          <NotificationInitializer>
            <div className="App">
              <Routes>
                <Route path="/signup" element={<SignUp />} />
                <Route path="/login" element={<Login />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/messaging" element={<Messaging />} />
                <Route path="/files" element={<Files />} />
                <Route path="/posts" element={<Posts />} />
                <Route path="/deadlines" element={<Deadlines />} />
                <Route path="/" element={<Navigate to="/dashboard" />} />
              </Routes>
            </div>
          </NotificationInitializer>
        </ThemeProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
