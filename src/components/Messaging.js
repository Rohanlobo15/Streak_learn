import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { db, storage } from '../firebase';
import { 
  collection, 
  addDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  limit,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { 
  ref, 
  uploadBytesResumable, 
  getDownloadURL
} from 'firebase/storage';
import './Messaging.css';

export default function Messaging() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [fileUploadProgress, setFileUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    // Check if group chat exists, if not create it
    const initializeGroupChat = async () => {
      try {
        const groupChatRef = doc(db, 'groupChats', 'mainGroupChat');
        const groupChatDoc = await getDoc(groupChatRef);
        
        if (!groupChatDoc.exists()) {
          await setDoc(groupChatRef, {
            name: 'Streak Learn Group Chat',
            createdAt: serverTimestamp(),
            memberLimit: 7
          });
        }
      } catch (error) {
        console.error('Error initializing group chat:', error);
      }
    };

    // Fetch group members (limit to 7)
    const fetchMembers = async () => {
      try {
        const membersRef = collection(db, 'groupChatMembers');
        const q = query(membersRef, limit(7));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const membersData = [];
          snapshot.forEach(doc => {
            membersData.push({
              id: doc.id,
              ...doc.data()
            });
          });
          
          setMembers(membersData);
          
          // If current user is not a member and there are less than 7 members, add them
          if (membersData.length < 7 && !membersData.some(member => member.id === currentUser.uid)) {
            addMember();
          }
        });
        
        return unsubscribe;
      } catch (error) {
        console.error('Error fetching members:', error);
        setError('Failed to load members');
      }
    };

    // Add current user as a member if not already
    const addMember = async () => {
      try {
        const memberRef = doc(db, 'groupChatMembers', currentUser.uid);
        const memberDoc = await getDoc(memberRef);
        
        if (!memberDoc.exists()) {
          await setDoc(memberRef, {
            name: currentUser.role || currentUser.email.split('@')[0],
            email: currentUser.email,
            photoURL: currentUser.photoURL || null,
            joinedAt: serverTimestamp()
          });
        }
      } catch (error) {
        console.error('Error adding member:', error);
      }
    };

    // Fetch messages
    const fetchMessages = async () => {
      try {
        const messagesRef = collection(db, 'groupChatMessages');
        const q = query(messagesRef, orderBy('timestamp', 'asc'));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
          const messagesData = [];
          snapshot.forEach(doc => {
            messagesData.push({
              id: doc.id,
              ...doc.data(),
              timestamp: doc.data().timestamp?.toDate() || new Date()
            });
          });
          setMessages(messagesData);
          setLoading(false);
          // Scroll to bottom after messages load
          setTimeout(scrollToBottom, 100);
        });

        return unsubscribe;
      } catch (error) {
        console.error('Error fetching messages:', error);
        setError('Failed to load messages');
        setLoading(false);
      }
    };

    const unsubscribers = [];
    
    initializeGroupChat()
      .then(() => fetchMembers())
      .then(unsubscribe => unsubscribe && unsubscribers.push(unsubscribe))
      .then(() => fetchMessages())
      .then(unsubscribe => unsubscribe && unsubscribers.push(unsubscribe));

    // Cleanup on unmount
    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe && unsubscribe());
    };
  }, [currentUser, navigate]);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Handle sending a message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if ((!message.trim() && !file) || isUploading) return;
    
    try {
      let fileData = null;
      
      // Handle file upload if a file is selected
      if (file) {
        setIsUploading(true);
        fileData = await uploadFile(file);
        setIsUploading(false);
        setFile(null);
        setFileUploadProgress(0);
      }
      
      // Check if this is a clear command
      if (message.trim() === 'clear_123') {
        await clearAllMessages();
        setMessage('');
        return;
      }
      
      // Add message to Firestore
      await addDoc(collection(db, 'groupChatMessages'), {
        text: message.trim(),
        senderId: currentUser.uid,
        senderName: currentUser.role || currentUser.email.split('@')[0],
        senderPhotoURL: currentUser.photoURL || null,
        timestamp: serverTimestamp(),
        file: fileData
      });
      
      // Clear message input
      setMessage('');
      
    } catch (error) {
      console.error('Error sending message:', error);
      setError('Failed to send message');
    }
  };

  // Clear all messages
  const clearAllMessages = async () => {
    try {
      // Show clearing in progress
      setLoading(true);
      setMessages([]);
      
      // Get all messages
      const messagesRef = collection(db, 'groupChatMessages');
      const querySnapshot = await getDocs(messagesRef);
      
      // Use batch to delete all messages
      const batch = writeBatch(db);
      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      // Commit the batch
      await batch.commit();
      
      // Add system message that chat was cleared
      await addDoc(collection(db, 'groupChatMessages'), {
        text: "Chat has been cleared by " + currentUser.role || currentUser.email.split('@')[0],
        senderId: "system",
        senderName: "System",
        senderPhotoURL: null,
        timestamp: serverTimestamp(),
        isSystemMessage: true
      });
      
      setLoading(false);
    } catch (error) {
      console.error('Error clearing messages:', error);
      setError('Failed to clear messages');
      setLoading(false);
    }
  };

  // Handle file upload
  const uploadFile = async (file) => {
    try {
      const timestamp = new Date().getTime();
      const storageRef = ref(storage, `groupChat/${currentUser.uid}/${timestamp}_${file.name}`);
      
      // Upload file with progress monitoring
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      return new Promise((resolve, reject) => {
        uploadTask.on('state_changed', 
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setFileUploadProgress(progress);
          },
          (error) => {
            console.error('Error uploading file:', error);
            reject(error);
          },
          async () => {
            // Upload complete, get download URL
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            
            resolve({
              name: file.name,
              type: file.type,
              size: file.size,
              url: downloadURL,
              path: `groupChat/${currentUser.uid}/${timestamp}_${file.name}`
            });
          }
        );
      });
    } catch (error) {
      console.error('Error in file upload:', error);
      setError('Failed to upload file');
      return null;
    }
  };

  // Handle file download
  const handleDownloadFile = (fileUrl, fileName) => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Handle file selection
  const handleFileChange = (e) => {
    if (e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  // Trigger file input click
  const triggerFileInput = () => {
    fileInputRef.current.click();
  };

  // Toggle sidebar
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Format timestamp
  const formatTime = (timestamp) => {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Format date
  const formatDate = (date) => {
    return date.toLocaleDateString([], { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  };

  // Check if a message is from the current day
  const isToday = (date) => {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  // Group messages by date
  const groupMessagesByDate = () => {
    const groups = {};
    
    messages.forEach(message => {
      const date = new Date(message.timestamp);
      const dateString = formatDate(date);
      
      if (!groups[dateString]) {
        groups[dateString] = [];
      }
      
      groups[dateString].push(message);
    });
    
    return groups;
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

  // Render file preview
  const renderFilePreview = (file) => {
    if (file.type.startsWith('image/')) {
      return (
        <div className="file-preview image-preview">
          <img src={file.url} alt={file.name} />
        </div>
      );
    }
    
    return (
      <div className="file-preview">
        <div className="file-icon">{getFileIcon(file.type)}</div>
        <div className="file-info">
          <div className="file-name">{file.name}</div>
          <div className="file-size">{getFileSize(file.size)}</div>
        </div>
      </div>
    );
  };

  const messageGroups = groupMessagesByDate();

  return (
    <div className="messaging-container">
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
            <li><button className="nav-button active" onClick={() => navigate('/messaging')}>✉️ <span>Messages</span></button></li>
            <li><button className="nav-button" onClick={() => navigate('/files')}>📋 <span>Logs</span></button></li>
            <li><button className="nav-button" onClick={() => navigate('/deadlines')}>📅 <span>Deadlines</span></button></li>
            <li><button className="nav-button" onClick={() => navigate('/posts')}>📝 <span>Posts</span></button></li>
          </ul>
        </nav>
      </div>
      
      {/* Overlay */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)}></div>}
      
      <header className="messaging-header">
        <div className="header-left">
          <button 
            className="hamburger-menu" 
            onClick={toggleSidebar}
            aria-label="Toggle menu"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
          <h2>Group Chat</h2>
        </div>
        <div className="header-right">
          <div className="members-count">
            <span className="members-icon">👥</span>
            <span className="count">{members.length}/7</span>
          </div>
        </div>
      </header>

      {/* Error message */}
      {error && <div className="error-message">{error}</div>}

      {/* Main content */}
      <div className="group-chat-container">
        {/* Members list */}
        <div className="members-sidebar">
          <h2 className="members-title">Members</h2>
          <div className="members-list">
            {members.map(member => (
              <div key={member.id} className="member-item">
                <div className="member-avatar">
                  {member.photoURL ? (
                    <img src={member.photoURL} alt={member.name} />
                  ) : (
                    <span>{member.name.charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <div className="member-name">{member.name}</div>
              </div>
            ))}
            {Array(Math.max(0, 7 - members.length)).fill().map((_, index) => (
              <div key={`empty-${index}`} className="member-item empty">
                <div className="member-avatar empty">
                  <span>?</span>
                </div>
                <div className="member-name">Waiting...</div>
              </div>
            ))}
          </div>
        </div>

        {/* Chat area */}
        <div className="chat-area">
          {/* Messages */}
          <div className="messages-container">
            {loading ? (
              <div className="loading-messages">Loading messages...</div>
            ) : messages.length === 0 ? (
              <div className="no-messages">No messages yet. Start the conversation!</div>
            ) : (
              Object.entries(messageGroups).map(([date, messagesForDate]) => (
                <div key={date} className="message-group">
                  <div className="message-date">
                    {isToday(new Date(messagesForDate[0].timestamp)) ? 'Today' : date}
                  </div>
                  {messagesForDate.map(message => {
                    const isCurrentUser = message.senderId === currentUser?.uid;
                    const isSystemMessage = message.isSystemMessage;
                    return (
                      <div 
                        key={message.id} 
                        className={`message ${isCurrentUser ? 'sent' : isSystemMessage ? 'system' : 'received'}`}
                      >
                        {!isCurrentUser && !isSystemMessage && (
                          <div className="message-sender">
                            <div className="message-avatar">
                              {message.senderPhotoURL ? (
                                <img src={message.senderPhotoURL} alt={message.senderName} />
                              ) : (
                                <span>{message.senderName.charAt(0).toUpperCase()}</span>
                              )}
                            </div>
                          </div>
                        )}
                        <div className={`message-bubble ${isSystemMessage ? 'system-message' : ''}`}>
                          {!isCurrentUser && !isSystemMessage && (
                            <div className="sender-name">{message.senderName}</div>
                          )}
                          {message.text && (
                            <div className="message-text">{message.text}</div>
                          )}
                          {message.file && (
                            <div 
                              className="message-file" 
                              onClick={() => handleDownloadFile(message.file.url, message.file.name)}
                            >
                              {renderFilePreview(message.file)}
                              <div className="download-icon">⬇️</div>
                            </div>
                          )}
                          <div className="message-time">{formatTime(message.timestamp)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message input */}
          <form className="message-input-form" onSubmit={handleSendMessage}>
            {file && (
              <div className="selected-file">
                <div className="file-name">{file.name}</div>
                <button 
                  type="button" 
                  className="remove-file-button"
                  onClick={() => setFile(null)}
                >
                  ×
                </button>
              </div>
            )}
            {isUploading && (
              <div className="upload-progress">
                <div 
                  className="upload-progress-bar" 
                  style={{ width: `${fileUploadProgress}%` }}
                ></div>
                <span className="upload-progress-text">{Math.round(fileUploadProgress)}%</span>
              </div>
            )}
            <div className="message-input-container">
              <button 
                type="button" 
                className="attach-button"
                onClick={triggerFileInput}
                disabled={isUploading}
              >
                📎
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                style={{ display: 'none' }}
              />
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Type a message..."
                className="message-input"
                disabled={isUploading}
              />
              <button 
                type="submit" 
                className="send-button"
                disabled={isUploading || (!message.trim() && !file)}
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </div>

    </div>
  );
}
