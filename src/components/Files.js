import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { db, storage } from '../firebase';
import { generateSummary, extractFileContent, truncateText } from '../utils/geminiApi';
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
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileSectionOpen, setProfileSectionOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  // File upload functionality moved to Dashboard
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [summaries, setSummaries] = useState({});
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [customSummary, setCustomSummary] = useState('');
  const [showWriteSummaryModal, setShowWriteSummaryModal] = useState(false);


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
          file: logData.file || null,
          summary: logData.summary || null
        });
      });
      
      setFiles(logsData);
      
      // Load existing summaries into state
      const summariesObj = {};
      logsData.forEach(log => {
        if (log.summary) {
          summariesObj[log.id] = log.summary;
        }
      });
      setSummaries(summariesObj);
      
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
  
  // File upload functionality moved to Dashboard page

  // Handle log expansion toggle with smooth animation
  const handleToggleExpand = (logId) => {
    // If we're closing the current expanded log
    if (expandedLogId === logId) {
      // First set a CSS class to trigger the animation
      const summarySection = document.querySelector('.summary-section');
      const fileItem = document.querySelector(`.file-item[data-log-id="${logId}"]`);
      
      if (summarySection) {
        summarySection.classList.add('closing');
        
        // After animation completes, actually close it
        setTimeout(() => {
          setExpandedLogId(null);
        }, 280); // Slightly less than the CSS transition time
      } else {
        setExpandedLogId(null);
      }
    } else {
      // If there's a currently expanded log, close it first
      if (expandedLogId) {
        const currentSummary = document.querySelector('.summary-section');
        if (currentSummary) {
          currentSummary.classList.add('closing');
          
          // After animation completes, open the new one
          setTimeout(() => {
            setExpandedLogId(logId);
          }, 280);
          return;
        }
      }
      
      // Opening a new one - do it immediately if no log is currently expanded
      setExpandedLogId(logId);
    }
  };
  
  // Generate summary for a log using AI
  const handleGenerateSummary = async (log) => {
    try {
      setGeneratingSummary(true);
      
      let fileContent = null;
      
      // If there's a file, try to download and extract its content
      if (log.file && log.file.url) {
        try {
          const response = await fetch(log.file.url);
          const blob = await response.blob();
          const file = new File([blob], log.file.name, { type: log.file.type });
          fileContent = await extractFileContent(file);
        } catch (error) {
          console.error('Error extracting file content:', error);
          // Continue without file content if there's an error
        }
      }
      
      // Generate summary using Gemini API
      const summary = await generateSummary(
        log.topic, 
        log.hours, 
        fileContent ? truncateText(fileContent) : null
      );
      
      // Update state with the new summary
      setSummaries(prev => ({
        ...prev,
        [log.id]: summary
      }));
      
      // Save summary to Firestore
      const logDocRef = doc(db, 'studyLogs', currentUser.uid, 'logs', log.id);
      await updateDoc(logDocRef, { summary });
      
    } catch (error) {
      console.error('Error generating summary:', error);
      setError('Failed to generate summary');
    } finally {
      setGeneratingSummary(false);
    }
  };
  
  // Open modal to write a custom summary
  const openWriteSummaryModal = (log) => {
    setSelectedFile(log);
    setCustomSummary(log.summary || '');
    setShowWriteSummaryModal(true);
  };
  
  // Save custom summary
  const handleSaveCustomSummary = async () => {
    if (!selectedFile) return;
    
    try {
      setLoading(true);
      
      // Save custom summary to Firestore
      const logDocRef = doc(db, 'studyLogs', currentUser.uid, 'logs', selectedFile.id);
      await updateDoc(logDocRef, { summary: customSummary.trim() });
      
      // Update state
      setSummaries(prev => ({
        ...prev,
        [selectedFile.id]: customSummary.trim()
      }));
      
      // Close modal
      setShowWriteSummaryModal(false);
      setSelectedFile(null);
      setCustomSummary('');
      setLoading(false);
    } catch (error) {
      console.error('Error saving custom summary:', error);
      setError('Failed to save summary');
      setLoading(false);
    }
  };
  
  // Toggle edit mode for existing summary
  const toggleEditSummary = (logId) => {
    if (editingSummary) {
      // Save the edited summary
      handleSaveEditedSummary(logId);
    } else {
      // Enter edit mode
      setEditingSummary(true);
      setCustomSummary(summaries[logId] || '');
    }
  };
  
  // Save edited summary
  const handleSaveEditedSummary = async (logId) => {
    try {
      setLoading(true);
      
      // Save edited summary to Firestore
      const logDocRef = doc(db, 'studyLogs', currentUser.uid, 'logs', logId);
      await updateDoc(logDocRef, { summary: customSummary.trim() });
      
      // Update state
      setSummaries(prev => ({
        ...prev,
        [logId]: customSummary.trim()
      }));
      
      // Exit edit mode
      setEditingSummary(false);
      setCustomSummary('');
      setLoading(false);
    } catch (error) {
      console.error('Error saving edited summary:', error);
      setError('Failed to save summary');
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
          <div className="profile-section">
            <div className="profile-photo-container">
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
            <li><button className="nav-button" onClick={() => navigate('/files')}>📋 <span>Logs</span></button></li>
            <li><button className="nav-button" onClick={() => navigate('/deadlines')}>📅 <span>Deadlines</span></button></li>
            <li><button className="nav-button active" onClick={() => navigate('/posts')}>📝 <span>Posts</span></button></li>
          </ul>
          <div className="theme-toggle-container">
            <button className="theme-toggle" onClick={toggleTheme}>
              <span className="theme-toggle-text">{darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
              <span className="theme-toggle-icon">{darkMode ? '☀️' : '🌙'}</span>
            </button>
          </div>
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
            <h2>Logs</h2>
          </div>
          <div className="header-right">
            <button className="upload-button" onClick={() => navigate('/dashboard')}>Upload Files in Dashboard</button>
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
                  <React.Fragment key={log.id}>
                    <div 
                      className={`file-item ${expandedLogId === log.id ? 'expanded' : ''}`}
                      onClick={() => handleToggleExpand(log.id)}
                      data-log-id={log.id}
                    >
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
                        <div className="file-actions" onClick={(e) => e.stopPropagation()}>
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
                          <button 
                            className="file-action-button summary-button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleExpand(log.id);
                            }}
                            title="View/Generate Summary"
                          >
                            {expandedLogId === log.id ? '🔼' : '🔽'}
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Expanded summary section */}
                    {expandedLogId === log.id && (
                      <div className="summary-section">
                        <div className="summary-header">
                          <h3>Summary</h3>
                          {summaries[log.id] && (
                            <div className="summary-controls">
                              {editingSummary && expandedLogId === log.id ? (
                                <button 
                                  className="save-summary-button"
                                  onClick={() => toggleEditSummary(log.id)}
                                  disabled={loading}
                                >
                                  Save
                                </button>
                              ) : (
                                <button 
                                  className="edit-summary-button"
                                  onClick={() => toggleEditSummary(log.id)}
                                  disabled={loading}
                                >
                                  Edit
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                        
                        {generatingSummary && log.id === expandedLogId ? (
                          <div className="generating-summary">Generating summary...</div>
                        ) : summaries[log.id] ? (
                          editingSummary && expandedLogId === log.id ? (
                            <textarea
                              className="summary-editor"
                              value={customSummary}
                              onChange={(e) => setCustomSummary(e.target.value)}
                              placeholder="Edit your summary here..."
                            />
                          ) : (
                            <div className="summary-content">{summaries[log.id]}</div>
                          )
                        ) : (
                          <div className="summary-actions">
                            <p>No summary available yet.</p>
                            <div className="summary-buttons">
                              <button 
                                className="generate-summary-button"
                                onClick={() => handleGenerateSummary(log)}
                                disabled={generatingSummary || loading}
                              >
                                Generate AI Summary
                              </button>
                              <button 
                                className="write-summary-button"
                                onClick={() => openWriteSummaryModal(log)}
                                disabled={loading}
                              >
                                Write My Own
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Upload functionality removed - users are redirected to Dashboard for file uploads */}
      
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
      
      {/* Write Custom Summary Modal */}
      {showWriteSummaryModal && selectedFile && (
        <div className="modal-overlay">
          <div className="modal-container summary-modal">
            <div className="modal-header">
              <h3>Write Summary</h3>
              <button 
                className="modal-close-button" 
                onClick={() => {
                  setShowWriteSummaryModal(false);
                  setSelectedFile(null);
                  setCustomSummary('');
                }}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p>Write a custom summary for your study session on <strong>{selectedFile.topic}</strong>:</p>
              
              <div className="form-group">
                <textarea 
                  className="summary-textarea"
                  value={customSummary}
                  onChange={(e) => setCustomSummary(e.target.value)}
                  placeholder="Describe what you learned during this study session..."
                  rows={6}
                />
              </div>
              
              <div className="modal-actions">
                <button 
                  className="cancel-button" 
                  onClick={() => {
                    setShowWriteSummaryModal(false);
                    setSelectedFile(null);
                    setCustomSummary('');
                  }}
                >
                  Cancel
                </button>
                <button 
                  className="save-summary-button" 
                  onClick={handleSaveCustomSummary}
                  disabled={!customSummary.trim() || loading}
                >
                  {loading ? 'Saving...' : 'Save Summary'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
