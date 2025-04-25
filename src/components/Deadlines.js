import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
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
  where,
  serverTimestamp
} from 'firebase/firestore';
import './Deadlines.css';

export default function Deadlines() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileSectionOpen, setProfileSectionOpen] = useState(false);
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deadlines, setDeadlines] = useState([]);
  const [deadlineTitle, setDeadlineTitle] = useState('');
  const [deadlineDescription, setDeadlineDescription] = useState('');
  const [deadlineDate, setDeadlineDate] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all', 'pending', 'completed'
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedDeadline, setSelectedDeadline] = useState(null);
  const [userRoles, setUserRoles] = useState({});

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

  // Fetch deadlines with real-time updates
  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    setLoading(true);
    
    // Fetch user roles
    fetchUserRoles();
    
    // Set up real-time listener for deadlines
    const deadlinesRef = collection(db, 'deadlines');
    const deadlinesQuery = query(deadlinesRef, orderBy('createdAt', 'desc'));
    
    const unsubscribe = onSnapshot(deadlinesQuery, (snapshot) => {
      const deadlinesData = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        deadlinesData.push({
          id: doc.id,
          ...data,
          dueDate: data.dueDate?.toDate() || new Date(),
          createdAt: data.createdAt?.toDate() || new Date(),
          completedAt: data.completedAt?.toDate() || null
        });
      });
      
      setDeadlines(deadlinesData);
      setLoading(false);
    }, (error) => {
      console.error('Error listening to deadlines:', error);
      setError('Failed to load deadlines');
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [currentUser, navigate]);

  // Create a new deadline
  const handleCreateDeadline = async (e) => {
    e.preventDefault();
    
    if (!deadlineTitle.trim() || !deadlineDate) {
      setError('Please provide both a title and due date');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      
      const dueDate = new Date(deadlineDate);
      
      // Check if date is valid
      if (isNaN(dueDate.getTime())) {
        throw new Error('Invalid date format');
      }
      
      // Create new deadline document
      await addDoc(collection(db, 'deadlines'), {
        title: deadlineTitle.trim(),
        description: deadlineDescription.trim(),
        dueDate: Timestamp.fromDate(dueDate),
        createdBy: currentUser.uid,
        creatorRole: userRoles[currentUser.uid]?.role || 'Unknown User',
        createdAt: serverTimestamp(),
        completed: false,
        completedAt: null,
        completedBy: null,
        completedByRole: null
      });
      
      // Reset form
      setDeadlineTitle('');
      setDeadlineDescription('');
      setDeadlineDate('');
      setLoading(false);
      
    } catch (error) {
      console.error('Error creating deadline:', error);
      setError(error.message || 'Failed to create deadline');
      setLoading(false);
    }
  };

  // Mark deadline as completed
  const handleMarkCompleted = async (deadlineId) => {
    try {
      setLoading(true);
      
      const deadlineRef = doc(db, 'deadlines', deadlineId);
      
      await updateDoc(deadlineRef, {
        completed: true,
        completedAt: serverTimestamp(),
        completedBy: currentUser.uid,
        completedByRole: userRoles[currentUser.uid]?.role || 'Unknown User'
      });
      
      setLoading(false);
    } catch (error) {
      console.error('Error marking deadline as completed:', error);
      setError('Failed to update deadline');
      setLoading(false);
    }
  };

  // Confirm delete deadline
  const confirmDeleteDeadline = (deadline) => {
    setSelectedDeadline(deadline);
    setShowDeleteConfirm(true);
  };

  // Cancel delete
  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setSelectedDeadline(null);
  };

  // Delete deadline
  const handleDeleteDeadline = async () => {
    if (!selectedDeadline) return;
    
    try {
      setLoading(true);
      
      await deleteDoc(doc(db, 'deadlines', selectedDeadline.id));
      
      setShowDeleteConfirm(false);
      setSelectedDeadline(null);
      setLoading(false);
    } catch (error) {
      console.error('Error deleting deadline:', error);
      setError('Failed to delete deadline');
      setLoading(false);
    }
  };

  // Format date for display
  const formatDate = (date) => {
    if (!date) return 'No date';
    
    const options = { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    };
    
    return new Date(date).toLocaleDateString(undefined, options);
  };

  // Calculate days remaining
  const getDaysRemaining = (dueDate) => {
    const now = new Date();
    const due = new Date(dueDate);
    const diffTime = due - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return 'Overdue';
    } else if (diffDays === 0) {
      return 'Due today';
    } else if (diffDays === 1) {
      return '1 day left';
    } else {
      return `${diffDays} days left`;
    }
  };

  // Get status class based on days remaining
  const getStatusClass = (dueDate, completed) => {
    if (completed) return 'status-completed';
    
    const now = new Date();
    const due = new Date(dueDate);
    const diffTime = due - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return 'status-overdue';
    } else if (diffDays <= 2) {
      return 'status-urgent';
    } else if (diffDays <= 7) {
      return 'status-approaching';
    } else {
      return 'status-good';
    }
  };

  // Toggle sidebar
  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Handle logout
  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out:', error);
      setError('Failed to log out');
    }
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

  // Filter deadlines based on active tab
  const filteredDeadlines = deadlines.filter(deadline => {
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') return !deadline.completed;
    if (activeTab === 'completed') return deadline.completed;
    return true;
  });

  // State for toggle view between create and view
  const [activeView, setActiveView] = useState('view'); // 'create' or 'view'

  return (
    <div className="deadlines-container">
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
              <h3>{userRoles[currentUser?.uid]?.role || 'User'}</h3>
              <p className="user-email text-center">{currentUser?.email}</p>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <ul>
            <li><button className="nav-button" onClick={() => navigate('/dashboard')}>🏠 <span>Dashboard</span></button></li>
            <li><button className="nav-button" onClick={() => navigate('/messaging')}>✉️ <span>Messages</span></button></li>
            <li><button className="nav-button" onClick={() => navigate('/files')}>📋 <span>My Logs</span></button></li>
            <li><button className="nav-button" onClick={() => navigate('/posts')}>📝 <span>Posts</span></button></li>
            <li><button className="nav-button active" onClick={() => navigate('/deadlines')}>⏰ <span>Deadlines</span></button></li>
          </ul>
        </nav>
      </div>
      
      {/* Overlay */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)}></div>}
      
      {/* Main Content */}
      <div className="main-content">
        {/* Header */}
        <header className="deadlines-header">
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
            <h2>Deadlines</h2>
          </div>
          <div className="header-right">
            <button className="logout-button" onClick={handleLogout}>Logout</button>
          </div>
        </header>

        {error && <div className="error-message">{error}</div>}

        {/* View Toggle Switch */}
        <div className="view-toggle-container">
          <div className="view-toggle">
            <button 
              className={`toggle-button ${activeView === 'create' ? 'active' : ''}`}
              onClick={() => setActiveView('create')}
            >
              <span className="toggle-icon">✏️</span> Create Deadlines
            </button>
            <button 
              className={`toggle-button ${activeView === 'view' ? 'active' : ''}`}
              onClick={() => setActiveView('view')}
            >
              <span className="toggle-icon">👁️</span> View Deadlines
            </button>
          </div>
        </div>

        {/* Deadlines Content */}
        <div className="deadlines-content side-by-side">
          {/* Left Side - Create Deadline Form */}
          <div className={`deadlines-panel create-panel ${activeView === 'create' ? 'active' : ''}`}>
            <div className="create-deadline-container">
              <h3>Set New Deadline</h3>
              <form onSubmit={handleCreateDeadline}>
                <div className="form-group">
                  <label htmlFor="deadline-title">Title</label>
                  <input 
                    type="text" 
                    id="deadline-title" 
                    value={deadlineTitle} 
                    onChange={(e) => setDeadlineTitle(e.target.value)} 
                    placeholder="Enter deadline title" 
                    required 
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="deadline-description">Description (optional)</label>
                  <textarea 
                    id="deadline-description" 
                    value={deadlineDescription} 
                    onChange={(e) => setDeadlineDescription(e.target.value)} 
                    placeholder="Enter deadline details" 
                    rows={3}
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="deadline-date">Due Date</label>
                  <input 
                    type="datetime-local" 
                    id="deadline-date" 
                    value={deadlineDate} 
                    onChange={(e) => setDeadlineDate(e.target.value)} 
                    required 
                  />
                </div>
                
                <button 
                  type="submit" 
                  className="create-deadline-button" 
                  disabled={loading || !deadlineTitle.trim() || !deadlineDate}
                >
                  {loading ? 'Creating...' : 'Create Deadline'}
                </button>
              </form>
            </div>
          </div>
          
          {/* Right Side - View Deadlines */}
          <div className={`deadlines-panel view-panel ${activeView === 'view' ? 'active' : ''}`}>
            {/* Deadlines Tabs */}
            <div className="deadlines-tabs">
              <button 
                className={`tab-button ${activeTab === 'all' ? 'active' : ''}`}
                onClick={() => setActiveTab('all')}
              >
                All Deadlines
              </button>
              <button 
                className={`tab-button ${activeTab === 'pending' ? 'active' : ''}`}
                onClick={() => setActiveTab('pending')}
              >
                Pending
              </button>
              <button 
                className={`tab-button ${activeTab === 'completed' ? 'active' : ''}`}
                onClick={() => setActiveTab('completed')}
              >
                Completed
              </button>
            </div>
            
            {/* Deadlines List */}
            <div className="deadlines-list">
              {loading && deadlines.length === 0 ? (
                <div className="loading-message">Loading deadlines...</div>
              ) : filteredDeadlines.length === 0 ? (
                <div className="no-deadlines-message">
                  {activeTab === 'all' ? 'No deadlines found' : 
                  activeTab === 'pending' ? 'No pending deadlines' : 
                  'No completed deadlines'}
                </div>
              ) : (
                filteredDeadlines.map(deadline => (
                  <div 
                    key={deadline.id} 
                    className={`deadline-card ${getStatusClass(deadline.dueDate, deadline.completed)}`}
                  >
                    <div className="deadline-header">
                      <div className="deadline-title-container">
                        <h3 className="deadline-title">{deadline.title}</h3>
                        <div className="deadline-creator">
                          Created by {deadline.creatorRole}
                        </div>
                      </div>
                      
                      {(currentUser.uid === deadline.createdBy || currentUser.uid === deadline.completedBy) && (
                        <button 
                          className="delete-deadline-button"
                          onClick={() => confirmDeleteDeadline(deadline)}
                          aria-label="Delete deadline"
                        >
                          🗑️
                        </button>
                      )}
                    </div>
                    
                    {deadline.description && (
                      <div className="deadline-description">
                        {deadline.description}
                      </div>
                    )}
                    
                    <div className="deadline-details">
                      <div className="deadline-dates">
                        <div className="deadline-due-date">
                          <span className="detail-label">Due:</span> {formatDate(deadline.dueDate)}
                        </div>
                        <div className="deadline-created-date">
                          <span className="detail-label">Created:</span> {formatDate(deadline.createdAt)}
                        </div>
                      </div>
                      
                      <div className="deadline-status">
                        {deadline.completed ? (
                          <div className="completed-status">
                            <span className="status-icon">✅</span>
                            <div className="status-details">
                              <div>Completed by {deadline.completedByRole}</div>
                              <div>{formatDate(deadline.completedAt)}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="pending-status">
                            <div className="days-remaining">{getDaysRemaining(deadline.dueDate)}</div>
                            <button 
                              className="mark-completed-button"
                              onClick={() => handleMarkCompleted(deadline.id)}
                              disabled={loading}
                            >
                              Mark as Completed
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && selectedDeadline && (
        <div className="modal-overlay">
          <div className="modal-container delete-confirm-modal">
            <div className="modal-header">
              <h3>Delete Deadline</h3>
              <button 
                className="modal-close-button" 
                onClick={cancelDelete}
              >
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete this deadline?</p>
              <p className="deadline-to-delete">
                <span className="deadline-icon">⏰</span>
                <span className="deadline-name">{selectedDeadline.title}</span>
              </p>
              <p className="warning-text">This action cannot be undone.</p>
              
              <div className="modal-actions">
                <button 
                  className="cancel-button" 
                  onClick={cancelDelete}
                >
                  Cancel
                </button>
                <button 
                  className="delete-confirm-button" 
                  onClick={handleDeleteDeadline}
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
