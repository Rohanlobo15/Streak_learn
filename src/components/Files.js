import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../firebase';
import { 
  collection, 
  getDocs, 
  query, 
  orderBy,
  doc,
  updateDoc,
  deleteDoc,
  setDoc
} from 'firebase/firestore';
import { 
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from 'firebase/storage';
import './Files.css';

export default function Files() {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileSectionOpen, setProfileSectionOpen] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [newFileName, setNewFileName] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [topic, setTopic] = useState('');
  const [hours, setHours] = useState(1);
  const fileInputRef = useRef(null);

  // Fetch all study logs (with or without files)
  const fetchFiles = async () => {
    try {
      setLoading(true);
      
      // Get all study logs for the current user
      const logsRef = collection(db, 'studyLogs', currentUser.uid, 'logs');
      const q = query(logsRef, orderBy('timestamp', 'desc'));
      const logsSnapshot = await getDocs(q);
      
      const logsData = [];
      
      // Extract data from each log, regardless of whether it has a file
      logsSnapshot.forEach(doc => {
        const logData = doc.data();
        logsData.push({
          id: doc.id,
          date: doc.id,
          timestamp: logData.timestamp?.toDate() || new Date(),
          hours: logData.hours || 0,
          topic: logData.topic || 'No topic',
          file: logData.file || null
        });
      });
      
      setFiles(logsData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching logs:', error);
      setError('Failed to load logs');
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

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

  // Handle log deletion (with or without file)
  const handleDeleteFile = async () => {
    if (!selectedFile) return;
    
    try {
      setLoading(true);
      
      // Delete file from storage if it exists
      if (selectedFile.file && selectedFile.file.path) {
        const fileRef = ref(storage, selectedFile.file.path);
        await deleteObject(fileRef);
      }
      
      // Delete log document
      await deleteDoc(doc(db, 'studyLogs', currentUser.uid, 'logs', selectedFile.id));
      
      // Update state
      setFiles(prevFiles => prevFiles.filter(file => file.id !== selectedFile.id));
      setShowDeleteConfirm(false);
      setSelectedFile(null);
      setLoading(false);
    } catch (error) {
      console.error('Error deleting log:', error);
      setError('Failed to delete log');
      setLoading(false);
    }
  };
  
  // Open rename modal with the current file name (if file exists)
  const openRenameModal = (log) => {
    setSelectedFile(log);
    // Set initial name based on whether there's a file or not
    if (log.file) {
      setNewFileName(log.file.name);
    } else {
      setNewFileName('');
    }
    setShowRenameModal(true);
  };
  
  // Handle file rename
  const handleRenameFile = async () => {
    if (!selectedFile || !newFileName.trim()) return;
    
    try {
      setLoading(true);
      
      // Update the file name in Firestore if the file exists
      const logDocRef = doc(db, 'studyLogs', currentUser.uid, 'logs', selectedFile.id);
      
      if (selectedFile.file) {
        // Update existing file name
        await updateDoc(logDocRef, {
          'file.name': newFileName.trim()
        });
        
        // Update state for immediate UI feedback
        setFiles(prevFiles => 
          prevFiles.map(file => 
            file.id === selectedFile.id 
              ? { ...file, file: { ...file.file, name: newFileName.trim() } } 
              : file
          )
        );
      } else {
        // No file to rename, show error
        setError('No file to rename');
      }
      
      // Close modal and reset state
      setShowRenameModal(false);
      setSelectedFile(null);
      setNewFileName('');
      setLoading(false);
    } catch (error) {
      console.error('Error renaming file:', error);
      setError('Failed to rename file');
      setLoading(false);
    }
  };
  
  // Handle file upload
  const handleFileSelect = (e) => {
    if (e.target.files.length > 0) {
      setUploadedFile(e.target.files[0]);
    }
  };
  
  const handleUploadFile = async (e) => {
    e.preventDefault();
    
    if (!uploadedFile || !topic.trim() || hours <= 0) return;
    
    try {
      setLoading(true);
      
      // Create a unique filename with timestamp to prevent overwriting
      const timestamp = new Date().getTime();
      const originalFileName = uploadedFile.name;
      const filePath = `files/${currentUser.uid}/${timestamp}_${originalFileName}`;
      
      // Upload file to Firebase Storage
      const storageRef = ref(storage, filePath);
      const uploadTask = uploadBytesResumable(storageRef, uploadedFile);
      
      // Monitor upload progress
      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setUploadProgress(progress);
        },
        (error) => {
          console.error('Error uploading file:', error);
          setError('Failed to upload file');
          setLoading(false);
        },
        async () => {
          // Get download URL
          const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
          
          // Create a unique log ID using timestamp to prevent overwriting
          const uniqueLogId = `log_${timestamp}`;
          const logDocRef = doc(db, 'studyLogs', currentUser.uid, 'logs', uniqueLogId);
          
          // Create a new log document with the uploaded file
          await setDoc(logDocRef, {
            timestamp: new Date(),
            topic: topic.trim(),
            hours: Number(hours),
            file: {
              name: originalFileName,
              type: uploadedFile.type,
              size: uploadedFile.size,
              url: downloadURL,
              path: filePath
            }
          });
          
          // Reset form
          setUploadedFile(null);
          setTopic('');
          setHours(1);
          setUploadProgress(0);
          setShowUploadModal(false);
          
          // Refresh files list
          fetchFiles();
        }
      );
    } catch (error) {
      console.error('Error uploading file:', error);
      setError('Failed to upload file');
      setLoading(false);
    }
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
    if (!fileType) return '📋'; // No file icon
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
    if (!bytes) return 'N/A';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    return (bytes / 1073741824).toFixed(1) + ' GB';
  };

  // Handle outside clicks to close sidebar
  const handleOutsideClick = useCallback((e) => {
    if (sidebarOpen && !e.target.closest('.sidebar') && !e.target.closest('.menu-button') && !e.target.closest('.hamburger-menu')) {
      setSidebarOpen(false);
      setProfileSectionOpen(false);
    }
    
    if (profileSectionOpen && !e.target.closest('.profile-section') && !e.target.closest('.profile-photo-container')) {
      setProfileSectionOpen(false);
    }
  }, [sidebarOpen, profileSectionOpen]);

  // Add event listener for outside clicks
  useEffect(() => {
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [handleOutsideClick]);

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
            <li><button className="nav-button active" onClick={() => navigate('/files')}>📋 <span>My Logs</span></button></li>
            <li><button className="nav-button" onClick={() => navigate('/posts')}>📝 <span>Posts</span></button></li>
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
            <h2>My Logs</h2>
          </div>
          <div className="header-right">
            <button className="upload-button" onClick={() => setShowUploadModal(true)}>Upload File</button>
            <button className="logout-button" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        {/* Files Content */}
        <div className="files-content">
          {loading ? (
            <div className="loading-message">Loading files...</div>
          ) : files.length === 0 ? (
            <div className="no-files-message">
              <h2>No study logs yet</h2>
              <p>Your study logs will appear here when you log your study hours.</p>
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
                {files.map((log) => (
                  <div key={log.id} className="file-item">
                    <div className="file-column file-icon-column">
                      <span className="file-icon">{log.file ? getFileIcon(log.file.type) : '📋'}</span>
                    </div>
                    <div className="file-column file-name-column">
                      {log.file ? (
                        <>
                          <div className="file-name" title={log.file.name}>
                            {log.file.name}
                          </div>
                          <div className="file-timestamp">{formatTime(log.timestamp)}</div>
                        </>
                      ) : (
                        <div className="file-name no-file">No file attached</div>
                      )}
                    </div>
                    <div className="file-column file-date-column">{formatDate(log.date)}</div>
                    <div className="file-column file-topic-column">{log.topic}</div>
                    <div className="file-column file-hours-column">{log.hours} hrs</div>
                    <div className="file-column file-size-column">{log.file ? getFileSize(log.file.size) : 'N/A'}</div>
                    <div className="file-column file-actions-column">
                      <div className="file-actions">
                        {log.file && (
                          <>
                            <button 
                              className="file-action-button download-button"
                              onClick={() => handleDownload(log.file.url, log.file.name)}
                              title="Download file"
                            >
                              ⬇️
                            </button>
                            <button 
                              className="file-action-button rename-button"
                              onClick={() => openRenameModal(log)}
                              title="Rename file"
                            >
                              ✏️
                            </button>
                          </>
                        )}
                        <button 
                          className="file-action-button delete-button"
                          onClick={() => {
                            setSelectedFile(log);
                            setShowDeleteConfirm(true);
                          }}
                          title="Delete log"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Upload File Modal */}
      {showUploadModal && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h3>Upload New File</h3>
              <button 
                className="modal-close-button" 
                onClick={() => {
                  setShowUploadModal(false);
                  setUploadedFile(null);
                  setTopic('');
                  setHours(1);
                  setUploadProgress(0);
                }}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={handleUploadFile}>
                <div className="form-group">
                  <label htmlFor="file-upload">Select File</label>
                  <input 
                    type="file" 
                    id="file-upload" 
                    onChange={handleFileSelect} 
                    ref={fileInputRef}
                    required 
                  />
                  {uploadedFile && (
                    <div className="selected-file">
                      <span className="file-icon">{getFileIcon(uploadedFile.type)}</span>
                      <span className="file-name">{uploadedFile.name}</span>
                      <span className="file-size">({getFileSize(uploadedFile.size)})</span>
                    </div>
                  )}
                </div>
                
                <div className="form-group">
                  <label htmlFor="topic">Study Topic</label>
                  <input 
                    type="text" 
                    id="topic" 
                    value={topic} 
                    onChange={(e) => setTopic(e.target.value)} 
                    placeholder="What did you study?" 
                    required 
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="hours">Hours Studied</label>
                  <input 
                    type="number" 
                    id="hours" 
                    value={hours} 
                    onChange={(e) => setHours(Math.max(0.1, Number(e.target.value)))} 
                    min="0.1" 
                    step="0.1" 
                    required 
                  />
                </div>
                
                {uploadProgress > 0 && uploadProgress < 100 && (
                  <div className="upload-progress">
                    <div 
                      className="progress-bar" 
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                    <span className="progress-text">{Math.round(uploadProgress)}%</span>
                  </div>
                )}
                
                <div className="modal-actions">
                  <button 
                    type="button" 
                    className="cancel-button" 
                    onClick={() => {
                      setShowUploadModal(false);
                      setUploadedFile(null);
                      setTopic('');
                      setHours(1);
                      setUploadProgress(0);
                    }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="upload-submit-button" 
                    disabled={!uploadedFile || !topic.trim() || hours <= 0 || loading}
                  >
                    {loading ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      
      {/* Rename File Modal */}
      {showRenameModal && selectedFile && selectedFile.file && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header">
              <h3>Rename File</h3>
              <button 
                className="modal-close-button" 
                onClick={() => {
                  setShowRenameModal(false);
                  setSelectedFile(null);
                  setNewFileName('');
                }}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <form onSubmit={(e) => {
                e.preventDefault();
                handleRenameFile();
              }}>
                <div className="form-group">
                  <label htmlFor="new-file-name">New File Name</label>
                  <input 
                    type="text" 
                    id="new-file-name" 
                    value={newFileName} 
                    onChange={(e) => setNewFileName(e.target.value)} 
                    placeholder="Enter new file name" 
                    autoFocus
                    required 
                  />
                  <p className="form-help-text">Enter a new name for your file. The file extension will be preserved.</p>
                </div>
                
                <div className="modal-actions">
                  <button 
                    type="button" 
                    className="cancel-button" 
                    onClick={() => {
                      setShowRenameModal(false);
                      setSelectedFile(null);
                      setNewFileName('');
                    }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="rename-submit-button" 
                    disabled={!newFileName.trim() || loading}
                  >
                    {loading ? 'Renaming...' : 'Rename'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedFile && (
        <div className="modal-overlay">
          <div className="modal-container delete-confirm-modal">
            <div className="modal-header">
              <h3>Delete Log</h3>
              <button 
                className="modal-close-button" 
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setSelectedFile(null);
                }}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete this study log?</p>
              <p className="file-to-delete">
                <span className="file-icon">{selectedFile.file ? getFileIcon(selectedFile.file.type) : '📋'}</span>
                <span className="file-name">
                  {selectedFile.file ? selectedFile.file.name : 'Study log from ' + formatDate(selectedFile.date)}
                </span>
              </p>
              {selectedFile.file && (
                <p className="warning-text">This will also delete the associated file. This action cannot be undone.</p>
              )}
              {!selectedFile.file && (
                <p className="warning-text">This action cannot be undone.</p>
              )}
              
              <div className="modal-actions">
                <button 
                  className="cancel-button" 
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setSelectedFile(null);
                  }}
                >
                  Cancel
                </button>
                <button 
                  className="delete-confirm-button" 
                  onClick={handleDeleteFile}
                  disabled={loading}
                >
                  {loading ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
