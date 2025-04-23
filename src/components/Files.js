import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../firebase';
import { 
  collection, 
  getDocs, 
  query, 
  orderBy
} from 'firebase/firestore';
import './Files.css';

export default function Files() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileSectionOpen, setProfileSectionOpen] = useState(false);

  // Fetch all uploaded files
  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    const fetchFiles = async () => {
      try {
        setLoading(true);
        
        // Get all study logs for the current user
        const logsRef = collection(db, 'studyLogs', currentUser.uid, 'logs');
        const q = query(logsRef, orderBy('timestamp', 'desc'));
        const logsSnapshot = await getDocs(q);
        
        const filesData = [];
        
        // Extract file data from each log
        logsSnapshot.forEach(doc => {
          const logData = doc.data();
          if (logData.file) {
            filesData.push({
              id: doc.id,
              date: doc.id,
              timestamp: logData.timestamp?.toDate() || new Date(),
              hours: logData.hours,
              topic: logData.topic,
              file: logData.file
            });
          }
        });
        
        setFiles(filesData);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching files:', error);
        setError('Failed to load files');
        setLoading(false);
      }
    };

    fetchFiles();
  }, [currentUser, navigate]);

  // Handle file download
  const handleDownload = (fileUrl, fileName) => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out', error);
      setError('Failed to log out');
    }
  };

  // Format date
  const formatDate = (date) => {
    return new Date(date).toLocaleDateString([], { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  // Format time
  const formatTime = (date) => {
    return date.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Get file icon based on file type
  const getFileIcon = (fileType) => {
    if (fileType.startsWith('image/')) return '🖼️';
    if (fileType.startsWith('video/')) return '🎬';
    if (fileType.startsWith('audio/')) return '🎵';
    if (fileType.includes('pdf')) return '📄';
    if (fileType.includes('word') || fileType.includes('document')) return '📝';
    if (fileType.includes('excel') || fileType.includes('sheet')) return '📊';
    if (fileType.includes('powerpoint') || fileType.includes('presentation')) return '📑';
    if (fileType.includes('zip') || fileType.includes('compressed')) return '🗜️';
    return '📁';
  };

  // Get file size in readable format
  const getFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(1) + ' GB';
  };

  // Handle outside clicks to close sidebar
  const handleOutsideClick = (e) => {
    if (sidebarOpen && !e.target.closest('.sidebar') && !e.target.closest('.menu-button') && !e.target.closest('.hamburger-menu')) {
      setSidebarOpen(false);
      setProfileSectionOpen(false);
    }
    
    if (profileSectionOpen && !e.target.closest('.profile-section') && !e.target.closest('.profile-photo-container')) {
      setProfileSectionOpen(false);
    }
  };

  // Add event listener for outside clicks
  useEffect(() => {
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [sidebarOpen, profileSectionOpen]);

  return (
    <div className="files-container">
      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <button 
          className="close-sidebar-button" 
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        >
          &times;
        </button>
        <div className="sidebar-header">
          <div className={`profile-section ${profileSectionOpen ? 'open' : ''}`}>
            <div 
              className="profile-photo-container" 
              onClick={() => setProfileSectionOpen(!profileSectionOpen)}
            >
              {currentUser?.photoURL ? (
                <img 
                  src={currentUser.photoURL} 
                  alt="Profile" 
                  className="profile-photo" 
                />
              ) : (
                <div className="profile-photo-placeholder">
                  {currentUser?.email?.charAt(0).toUpperCase() || '?'}
                </div>
              )}
            </div>
            <div className="sidebar-user-info">
              <h3>{currentUser?.role || 'User'}</h3>
              <p className="user-email text-center">{currentUser?.email}</p>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <ul>
            <li><button className="nav-button" onClick={() => navigate('/dashboard')}>🏠 <span>Dashboard</span></button></li>
            <li><button className="nav-button" onClick={() => navigate('/messaging')}>✉️ <span>Messages</span></button></li>
            <li><button className="nav-button active" onClick={() => navigate('/files')}>📂 <span>Files</span></button></li>
          </ul>
        </nav>
      </div>
      
      {/* Overlay */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)}></div>}
      {error && <div className="error-message">{error}</div>}

      {/* Main Content */}
      <div className="main-content">
        {/* Header */}
        <header className="files-header">
          <div className="header-left">
            <button 
              className="hamburger-menu" 
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle menu"
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
            <h2>My Files</h2>
          </div>
          <div className="header-right">
            <button className="logout-button" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        {/* Files Content */}
        <div className="files-content">
          {loading ? (
            <div className="loading-message">Loading files...</div>
          ) : files.length === 0 ? (
            <div className="no-files-message">
              <h2>No files uploaded yet</h2>
              <p>Files you upload when logging study hours will appear here.</p>
            </div>
          ) : (
            <div className="files-list">
              <div className="files-list-header">
                <div className="file-column file-icon-column">Type</div>
                <div className="file-column file-name-column">File Name</div>
                <div className="file-column file-date-column">Date</div>
                <div className="file-column file-topic-column">Topic</div>
                <div className="file-column file-hours-column">Hours</div>
                <div className="file-column file-size-column">Size</div>
                <div className="file-column file-actions-column">Actions</div>
              </div>
              
              <div className="files-list-body">
                {files.map((file) => (
                  <div key={file.id} className="file-item">
                    <div className="file-column file-icon-column">
                      <span className="file-icon">{getFileIcon(file.file.type)}</span>
                    </div>
                    <div className="file-column file-name-column">
                      <div className="file-name" title={file.file.name}>
                        {file.file.name}
                      </div>
                      <div className="file-timestamp">{formatTime(file.timestamp)}</div>
                    </div>
                    <div className="file-column file-date-column">{formatDate(file.date)}</div>
                    <div className="file-column file-topic-column">{file.topic}</div>
                    <div className="file-column file-hours-column">{file.hours} hrs</div>
                    <div className="file-column file-size-column">{getFileSize(file.file.size)}</div>
                    <div className="file-column file-actions-column">
                      <button 
                        className="download-button"
                        onClick={() => handleDownload(file.file.url, file.file.name)}
                        title="Download file"
                      >
                        ⬇️
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
