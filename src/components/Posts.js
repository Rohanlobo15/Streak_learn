import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { db, storage } from '../firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc,
  deleteDoc,
  updateDoc,
  Timestamp,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable, deleteObject } from 'firebase/storage';
import './Posts.css';

export default function Posts() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentUser, logout } = useAuth();
  const { darkMode, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [posts, setPosts] = useState([]);
  const [postContent, setPostContent] = useState('');
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  const [showCommentSection, setShowCommentSection] = useState({});
  const [commentText, setCommentText] = useState({});
  const fileInputRef = useRef(null);
  const [previewImages, setPreviewImages] = useState([]);
  const [userRoles, setUserRoles] = useState({});
  const [activeView, setActiveView] = useState('feed'); // 'feed' or 'create'

  // Load posts and set up real-time listeners
  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    setLoading(true);
    
    // Fetch all user roles for display
    const fetchUserRoles = async () => {
      try {
        const rolesRef = collection(db, 'roles');
        const rolesSnapshot = await getDocs(rolesRef);
        
        const rolesData = {};
        rolesSnapshot.forEach(doc => {
          if (doc.data().taken) {
            rolesData[doc.data().userId] = {
              role: doc.id,
              email: doc.data().email || ''
            };
          }
        });
        
        setUserRoles(rolesData);
      } catch (error) {
        console.error('Error fetching user roles:', error);
      }
    };
    
    fetchUserRoles();
    
    // Set up real-time listener for posts
    const postsRef = collection(db, 'posts');
    const postsQuery = query(postsRef, orderBy('timestamp', 'desc'));
    
    const unsubscribe = onSnapshot(postsQuery, async (snapshot) => {
      const postsData = [];
      
      for (const postDoc of snapshot.docs) {
        const postData = postDoc.data();
        
        // Fetch comments for this post
        const commentsRef = collection(db, 'posts', postDoc.id, 'comments');
        const commentsQuery = query(commentsRef, orderBy('timestamp', 'asc'));
        const commentsSnapshot = await getDocs(commentsQuery);
        
        const comments = [];
        commentsSnapshot.forEach(commentDoc => {
          comments.push({
            id: commentDoc.id,
            ...commentDoc.data(),
            timestamp: commentDoc.data().timestamp?.toDate() || new Date()
          });
        });
        
        // Fetch likes for this post
        const likesRef = collection(db, 'posts', postDoc.id, 'likes');
        const likesSnapshot = await getDocs(likesRef);
        
        const likes = [];
        likesSnapshot.forEach(likeDoc => {
          likes.push({
            id: likeDoc.id,
            userId: likeDoc.data().userId
          });
        });
        
        postsData.push({
          id: postDoc.id,
          ...postData,
          timestamp: postData.timestamp?.toDate() || new Date(),
          comments: comments,
          likes: likes,
          likedByCurrentUser: likes.some(like => like.userId === currentUser.uid)
        });
      }
      
      setPosts(postsData);
      setLoading(false);
    }, (error) => {
      console.error('Error listening to posts:', error);
      setError('Failed to load posts');
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [currentUser, navigate]);

  // Handle file selection
  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(files);
    
    // Generate previews for images
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    const previews = [];
    
    imageFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (e) => {
        previews.push({
          file: file,
          preview: e.target.result
        });
        if (previews.length === imageFiles.length) {
          setPreviewImages(previews);
        }
      };
      reader.readAsDataURL(file);
    });
    
    if (imageFiles.length === 0) {
      setPreviewImages([]);
    }
  };

  // Clear selected files
  const clearSelectedFiles = () => {
    setSelectedFiles([]);
    setPreviewImages([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Upload files and return their metadata
  const uploadFiles = async (files, postId) => {
    if (!files || files.length === 0) return [];
    
    const fileMetadata = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      
      try {
        // Create a unique filename with timestamp and original name
        const timestamp = new Date().getTime();
        const fileName = `${timestamp}_${file.name}`;
        
        // Create a storage reference
        const storageRef = ref(storage, `posts/${postId}/${fileName}`);
        
        // Upload the file with progress monitoring
        const uploadTask = uploadBytesResumable(storageRef, file);
        
        // Set up progress monitoring
        uploadTask.on('state_changed', 
          (snapshot) => {
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
            setUploadProgress(prev => ({
              ...prev,
              [file.name]: progress
            }));
          },
          (error) => {
            console.error('Error uploading file:', error);
            throw error;
          }
        );
        
        // Wait for upload to complete
        await uploadTask;
        
        // Get the download URL
        const downloadURL = await getDownloadURL(storageRef);
        
        fileMetadata.push({
          name: file.name,
          type: file.type,
          size: file.size,
          url: downloadURL,
          path: `posts/${postId}/${fileName}`,
          isImage: file.type.startsWith('image/')
        });
      } catch (error) {
        console.error('Error in file upload:', error);
      }
    }
    
    return fileMetadata;
  };

  // Create a new post
  const handleCreatePost = async (e) => {
    e.preventDefault();
    
    if (loading) return;
    
    if (!postContent.trim() && selectedFiles.length === 0) {
      setError('Please enter some content or select files to post');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      // Create post document first to get ID
      const postRef = await addDoc(collection(db, 'posts'), {
        content: postContent,
        userId: currentUser.uid,
        userRole: userRoles[currentUser.uid]?.role || 'Unknown',
        timestamp: serverTimestamp(),
        files: []
      });
      
      // Upload files if any
      if (selectedFiles.length > 0) {
        const fileMetadata = await uploadFiles(selectedFiles, postRef.id);
        
        // Update post with file metadata
        await updateDoc(doc(db, 'posts', postRef.id), {
          files: fileMetadata
        });
      }
      
      // Reset form
      setPostContent('');
      clearSelectedFiles();
      setUploadProgress({});
      
      setLoading(false);
    } catch (error) {
      console.error('Error creating post:', error);
      setError('Failed to create post');
      setLoading(false);
    }
  };

  // State for delete confirmation modal
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [postToDelete, setPostToDelete] = useState(null);

  // Show delete confirmation
  const confirmDeletePost = (postId, files) => {
    setPostToDelete({ id: postId, files });
    setShowDeleteConfirm(true);
  };

  // Cancel delete
  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setPostToDelete(null);
  };

  // Delete a post
  const handleDeletePost = async () => {
    if (!postToDelete) return;
    
    const { id: postId, files } = postToDelete;
    setShowDeleteConfirm(false);
    setLoading(true);
    
    try {
      // Delete files from storage
      for (const file of files) {
        if (file.path) {
          const fileRef = ref(storage, file.path);
          try {
            await deleteObject(fileRef);
          } catch (error) {
            console.error('Error deleting file:', error);
          }
        }
      }
      
      // Delete comments subcollection
      const commentsRef = collection(db, 'posts', postId, 'comments');
      const commentsSnapshot = await getDocs(commentsRef);
      
      const commentDeletions = commentsSnapshot.docs.map(commentDoc => 
        deleteDoc(doc(db, 'posts', postId, 'comments', commentDoc.id))
      );
      
      await Promise.all(commentDeletions);
      
      // Delete likes subcollection
      const likesRef = collection(db, 'posts', postId, 'likes');
      const likesSnapshot = await getDocs(likesRef);
      
      const likeDeletions = likesSnapshot.docs.map(likeDoc => 
        deleteDoc(doc(db, 'posts', postId, 'likes', likeDoc.id))
      );
      
      await Promise.all(likeDeletions);
      
      // Delete post document
      await deleteDoc(doc(db, 'posts', postId));
      
      setLoading(false);
    } catch (error) {
      console.error('Error deleting post:', error);
      setError('Failed to delete post');
      setLoading(false);
    }
  };

  // Toggle like on a post
  const handleToggleLike = async (postId, isLiked) => {
    setLoading(true);
    try {
      if (isLiked) {
        // Unlike: find and delete the like document
        const likesRef = collection(db, 'posts', postId, 'likes');
        const likesSnapshot = await getDocs(likesRef);
        
        const userLike = likesSnapshot.docs.find(doc => doc.data().userId === currentUser.uid);
        
        if (userLike) {
          await deleteDoc(doc(db, 'posts', postId, 'likes', userLike.id));
          
          // Update local state for immediate UI feedback
          setPosts(prevPosts => {
            return prevPosts.map(post => {
              if (post.id === postId) {
                const updatedLikes = post.likes.filter(like => like.userId !== currentUser.uid);
                return {
                  ...post,
                  likes: updatedLikes,
                  likedByCurrentUser: false
                };
              }
              return post;
            });
          });
        }
      } else {
        // Like: add a new like document
        const newLikeRef = await addDoc(collection(db, 'posts', postId, 'likes'), {
          userId: currentUser.uid,
          timestamp: serverTimestamp()
        });
        
        // Update local state for immediate UI feedback
        setPosts(prevPosts => {
          return prevPosts.map(post => {
            if (post.id === postId) {
              const newLike = {
                id: newLikeRef.id,
                userId: currentUser.uid
              };
              return {
                ...post,
                likes: [...post.likes, newLike],
                likedByCurrentUser: true
              };
            }
            return post;
          });
        });
      }
    } catch (error) {
      console.error('Error toggling like:', error);
      setError('Failed to update like');
    } finally {
      setLoading(false);
    }
  };

  // Add a comment to a post
  const handleAddComment = async (postId) => {
    const text = commentText[postId];
    
    if (!text || !text.trim()) {
      return;
    }
    
    setLoading(true);
    try {
      // Add the comment to Firestore
      const commentData = {
        text: text.trim(),
        userId: currentUser.uid,
        userRole: userRoles[currentUser.uid]?.role || 'Unknown',
        timestamp: serverTimestamp()
      };
      
      const newCommentRef = await addDoc(collection(db, 'posts', postId, 'comments'), commentData);
      
      // Create a temporary timestamp for immediate display
      const tempTimestamp = new Date();
      
      // Update local state for immediate UI feedback
      setPosts(prevPosts => {
        return prevPosts.map(post => {
          if (post.id === postId) {
            const newComment = {
              id: newCommentRef.id,
              ...commentData,
              timestamp: tempTimestamp // Use current time for immediate display
            };
            return {
              ...post,
              comments: [...post.comments, newComment]
            };
          }
          return post;
        });
      });
      
      // Clear comment input
      setCommentText(prev => ({
        ...prev,
        [postId]: ''
      }));
    } catch (error) {
      console.error('Error adding comment:', error);
      setError('Failed to add comment');
    } finally {
      setLoading(false);
    }
  };

  // Delete a comment
  const handleDeleteComment = async (postId, commentId) => {
    setLoading(true);
    try {
      await deleteDoc(doc(db, 'posts', postId, 'comments', commentId));
      
      // Update local state for immediate UI feedback
      setPosts(prevPosts => {
        return prevPosts.map(post => {
          if (post.id === postId) {
            return {
              ...post,
              comments: post.comments.filter(comment => comment.id !== commentId)
            };
          }
          return post;
        });
      });
    } catch (error) {
      console.error('Error deleting comment:', error);
      setError('Failed to delete comment');
    } finally {
      setLoading(false);
    }
  };

  // Format date for display
  const formatDate = (date) => {
    try {
      return new Date(date).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return 'Invalid date';
    }
  };

  // Format file size for display
  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
    else return (bytes / 1073741824).toFixed(1) + ' GB';
  };

  // Toggle sidebar
  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Handle logout
  const handleLogout = async () => {
    setError('');
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      setError('Failed to log out');
    }
  };

  return (
    <div className="posts-container">
      {/* Header */}
      <header className="posts-header">
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
          <h2>Streak Learn</h2>
        </div>
        <div className="header-right">
          <button className="logout-button" onClick={handleLogout}>Logout</button>
        </div>
      </header>
      
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
              <h3>{userRoles[currentUser?.uid]?.role || 'User'}</h3>
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

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="delete-confirm-overlay">
          <div className="delete-confirm-modal">
            <h3>Delete Post</h3>
            <p>Are you sure you want to delete this post? This action cannot be undone.</p>
            <div className="delete-confirm-actions">
              <button className="cancel-button" onClick={cancelDelete}>Cancel</button>
              <button className="delete-button" onClick={handleDeletePost}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="posts-main-content">
        <h1>Community Posts</h1>
        
        {/* Toggle Switch */}
        <div className="view-toggle">
          <button 
            className={`toggle-button ${activeView === 'feed' ? 'active' : ''}`}
            onClick={() => setActiveView('feed')}
          >
            <span className="toggle-icon">📱</span> Feed
          </button>
          <button 
            className={`toggle-button ${activeView === 'create' ? 'active' : ''}`}
            onClick={() => setActiveView('create')}
          >
            <span className="toggle-icon">✏️</span> Create
          </button>
        </div>
        
        {/* Two Column Layout */}
        <div className="posts-layout">
          {/* Left Column - Create Post Form */}
          <div className={`create-post-column ${activeView === 'create' ? 'active' : ''}`}>
            <div className="create-post-container">
              <h2>Create New Post</h2>
              <form onSubmit={handleCreatePost}>
                <div className="post-input-container">
                  <textarea
                    placeholder="Share something with the community..."
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    rows={5}
                  ></textarea>
                  
                  {previewImages.length > 0 && (
                    <div className="image-previews">
                      {previewImages.map((item, index) => (
                        <div key={index} className="image-preview-item">
                          <img src={item.preview} alt={`Preview ${index}`} />
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {selectedFiles.length > 0 && (
                    <div className="selected-files">
                      <h4>Selected Files ({selectedFiles.length})</h4>
                      <ul>
                        {selectedFiles.map((file, index) => (
                          <li key={index}>
                            {file.name} ({formatFileSize(file.size)})
                            {uploadProgress[file.name] > 0 && uploadProgress[file.name] < 100 && (
                              <div className="upload-progress-container">
                                <div 
                                  className="upload-progress-bar" 
                                  style={{ width: `${uploadProgress[file.name]}%` }}
                                ></div>
                                <span className="upload-progress-text">{Math.round(uploadProgress[file.name])}%</span>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                      <button type="button" className="clear-files-button" onClick={clearSelectedFiles}>
                        Clear Files
                      </button>
                    </div>
                  )}
                </div>
                
                <div className="post-actions">
                  <div className="file-upload-container">
                    <input
                      type="file"
                      multiple
                      onChange={handleFileSelect}
                      className="file-input"
                      id="post-file-upload"
                      ref={fileInputRef}
                    />
                    <label htmlFor="post-file-upload" className="file-upload-button">
                      <span className="file-icon">📎</span> Attach Files
                    </label>
                  </div>
                  
                  <button 
                    type="submit" 
                    className="post-button"
                    disabled={loading || (!postContent.trim() && selectedFiles.length === 0)}
                  >
                    {loading ? 'Posting...' : 'Post'}
                  </button>
                </div>
              </form>
            </div>
          </div>
          
          {/* Right Column - Posts Feed */}
          <div className={`posts-feed-column ${activeView === 'feed' ? 'active' : ''}`}>
            <div className="posts-list">
              {loading && posts.length === 0 ? (
                <div className="loading-indicator">Loading posts...</div>
              ) : posts.length === 0 ? (
                <div className="no-posts-message">No posts yet. Be the first to share something!</div>
              ) : (
                posts.map(post => (
              <div key={post.id} className="post-card">
                <div className="post-header">
                  <div className="post-user-info">
                    <div className="post-user-avatar">
                      {post.userRole?.charAt(0).toUpperCase() || '?'}
                    </div>
                    <div className="post-user-details">
                      <h3 className="post-user-name">{post.userRole}</h3>
                      <p className="post-timestamp">{formatDate(post.timestamp)}</p>
                    </div>
                  </div>
                  
                  {post.userId === currentUser.uid && (
                    <button 
                      className="delete-post-button"
                      onClick={() => confirmDeletePost(post.id, post.files || [])}
                      disabled={loading}
                    >
                      🗑️
                    </button>
                  )}
                </div>
                
                <div className="post-content">
                  {post.content && <p>{post.content}</p>}
                  
                  {/* Display images */}
                  {post.files && post.files.filter(file => file.isImage).length > 0 && (
                    <div className="post-images">
                      {post.files.filter(file => file.isImage).map((file, index) => (
                        <div key={index} className="post-image-container">
                          <img src={file.url} alt={file.name} className="post-image" />
                          <div className="image-overlay">
                            <a 
                              href={file.url} 
                              download={file.name}
                              className="download-image-button"
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              Download
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Display other files */}
                  {post.files && post.files.filter(file => !file.isImage).length > 0 && (
                    <div className="post-files">
                      <h4>Attached Files</h4>
                      <ul className="files-list">
                        {post.files.filter(file => !file.isImage).map((file, index) => (
                          <li key={index} className="file-item">
                            <span className="file-name">{file.name}</span>
                            <span className="file-size">({formatFileSize(file.size)})</span>
                            <a 
                              href={file.url} 
                              download={file.name}
                              className="download-file-button"
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Download
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                
                <div className="post-actions">
                  <button 
                    className={`like-button ${post.likedByCurrentUser ? 'liked' : ''}`}
                    onClick={() => handleToggleLike(post.id, post.likedByCurrentUser)}
                  >
                    {post.likedByCurrentUser ? '❤️' : '🤍'} {post.likes.length}
                  </button>
                  
                  <button 
                    className="comment-button"
                    onClick={() => setShowCommentSection(prev => ({
                      ...prev,
                      [post.id]: !prev[post.id]
                    }))}
                  >
                    💬 {post.comments ? post.comments.length : 0}
                  </button>
                </div>
                
                {/* Comments Section */}
                {showCommentSection[post.id] && (
                  <div className="comments-section">
                    <h4>Comments</h4>
                    
                    {!post.comments || post.comments.length === 0 ? (
                      <p className="no-comments-message">No comments yet. Be the first to comment!</p>
                    ) : (
                      <div className="comments-list">
                        {post.comments.map(comment => (
                          <div key={comment.id} className="comment">
                            <div className="comment-header">
                              <div className="comment-user-info">
                                <div className="comment-user-avatar">
                                  {comment.userRole?.charAt(0).toUpperCase() || '?'}
                                </div>
                                <div className="comment-user-details">
                                  <h5 className="comment-user-name">{comment.userRole}</h5>
                                  <p className="comment-timestamp">{formatDate(comment.timestamp)}</p>
                                </div>
                              </div>
                              
                              {comment.userId === currentUser.uid && (
                                <button 
                                  className="delete-comment-button"
                                  onClick={() => handleDeleteComment(post.id, comment.id)}
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                            
                            <p className="comment-text">{comment.text}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Add Comment Form */}
                    <div className="comment-form">
                      <textarea
                        className="comment-input"
                        placeholder="Write a comment..."
                        value={commentText[post.id] || ''}
                        onChange={(e) => setCommentText(prev => ({
                          ...prev,
                          [post.id]: e.target.value
                        }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            if (commentText[post.id]?.trim()) {
                              handleAddComment(post.id);
                            }
                          }
                        }}
                      />
                      <button 
                        className="submit-comment-button"
                        onClick={() => handleAddComment(post.id)}
                        disabled={loading || !commentText[post.id] || !commentText[post.id].trim()}
                      >
                        {loading ? 'Posting...' : 'Comment'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
