import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Timestamp,
  onSnapshot
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import './Dashboard.css';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement);

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [profileSectionOpen, setProfileSectionOpen] = useState(false);
  const { darkMode, toggleTheme } = useTheme();
  // Set chart theme colors
  const chartColors = {
    primary: '#4a6bff',
    secondary: '#6c63ff',
    accent: '#ff6584',
    success: '#28a745',
    warning: '#ffc107',
    danger: '#dc3545',
    backgroundColors: [
      'rgba(74, 107, 255, 0.7)',
      'rgba(108, 99, 255, 0.7)',
      'rgba(255, 101, 132, 0.7)',
      'rgba(40, 167, 69, 0.7)',
      'rgba(255, 193, 7, 0.7)',
      'rgba(220, 53, 69, 0.7)',
      'rgba(108, 117, 125, 0.7)',
    ],
    borderColors: [
      'rgba(74, 107, 255, 1)',
      'rgba(108, 99, 255, 1)',
      'rgba(255, 101, 132, 1)',
      'rgba(40, 167, 69, 1)',
      'rgba(255, 193, 7, 1)',
      'rgba(220, 53, 69, 1)',
      'rgba(108, 117, 125, 1)',
    ]
  };
  const { currentUser, logout, setCurrentUser } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [studyHours, setStudyHours] = useState('');
  const [studyTopic, setStudyTopic] = useState('');
  const [userStreak, setUserStreak] = useState(0);
  const [streakData, setStreakData] = useState({ labels: [], data: [] });  
  const [allRolesStreakData, setAllRolesStreakData] = useState([]);
  const [studyTimeData, setStudyTimeData] = useState({ labels: [], data: [] });
  const [weeklyLeaderboard, setWeeklyLeaderboard] = useState([]);
  const [monthlyLeaderboard, setMonthlyLeaderboard] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [detailedStudyHistory, setDetailedStudyHistory] = useState([]);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [fileUploadProgress, setFileUploadProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [expandedChart, setExpandedChart] = useState(null); // 'study' | 'streak' | null
  const [streakChartData, setStreakChartData] = useState({ labels: [], datasets: [] });

  // Format date as YYYY-MM-DD in IST
  const formatDate = (date) => {
    try {
      // Create a date object in the local timezone
      const localDate = new Date(date);
      
      // Convert to IST (UTC+5:30)
      const istDate = new Date(localDate.getTime() + (5.5 * 60 * 60 * 1000));
      
      // Format as YYYY-MM-DD
      return istDate.toISOString().split('T')[0];
    } catch (error) {
      console.error('Error formatting date:', error);
      // Fallback to local date format
      return new Date().toISOString().split('T')[0];
    }
  };

  // Get today's date in IST
  const getTodayIST = () => {
    return formatDate(new Date());
  };

  // Load user data and stats on component mount
  // Function to initialize streak data if needed - starts from today
  const updateAllUsersStreakData = async () => {
    try {
      // Get all roles to find all users
      const rolesRef = collection(db, 'roles');
      const rolesSnapshot = await getDocs(rolesRef);
      
      // Get today's date in YYYY-MM-DD format
      const today = new Date();
      const todayFormatted = today.toISOString().split('T')[0];
      
      console.log(`Initializing streak data with today's date: ${todayFormatted}`);
      
      // Process each role/user
      for (const roleDoc of rolesSnapshot.docs) {
        if (roleDoc.data().taken) {
          const userId = roleDoc.data().userId;
          const roleName = roleDoc.id;
          
          // Get current user streak
          const userDocRef = doc(db, 'users', userId);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            // Check if user already has streak data
            if (!userDoc.data().streak) {
              console.log(`Initializing streak data for ${roleName} (${userId})`);
              
              // Initialize streak to 0
              await setDoc(userDocRef, {
                streak: 0,
                lastStudyDate: null
              }, { merge: true });
            } else {
              console.log(`User ${roleName} already has streak data, skipping initialization`);
            }
          }
        }
      }
      
      console.log('Streak data initialization completed');
      // Refresh data after update
      await fetchAllRolesStreakHistory();
      await fetchLeaderboards();
      await fetchStudyTimeData();
      
    } catch (error) {
      console.error('Error initializing streak data:', error);
      setError('Failed to initialize streak data');
    }
  };

  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
      return;
    }

    setLoading(true);
    
    // Set up real-time listeners for all data
    const unsubscribers = [];
    
    // 1. Listen for streak changes
    const userDocRef = doc(db, 'users', currentUser.uid);
    const userUnsubscribe = onSnapshot(userDocRef, (userDoc) => {
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setUserStreak(userData.streak || 0);
      }
    }, (error) => {
      console.error('Error listening to user data:', error);
    });
    unsubscribers.push(userUnsubscribe);
    
    // 2. Listen for study logs changes
    const studyLogsRef = collection(db, 'studyLogs', currentUser.uid, 'logs');
    const studyLogsUnsubscribe = onSnapshot(studyLogsRef, (snapshot) => {
      const logs = [];
      snapshot.forEach(doc => {
        logs.push({
          date: doc.id,
          hours: doc.data().hours,
          topic: doc.data().topic,
          timestamp: doc.data().timestamp?.toDate() || new Date(),
          lastUpdated: doc.data().lastUpdated?.toDate() || new Date()
        });
      });
      
      // Sort by date
      logs.sort((a, b) => new Date(a.date) - new Date(b.date));
      
      // Prepare data for chart
      const labels = logs.map(item => item.date);
      const data = logs.map(item => item.hours);
      
      setStudyTimeData({ labels, data });
      setDetailedStudyHistory(logs);
      
      // After study logs update, refresh other data
      fetchStreak();
      fetchLeaderboards();
    }, (error) => {
      console.error('Error listening to study logs:', error);
    });
    unsubscribers.push(studyLogsUnsubscribe);
    
    // 3. Listen for roles collection changes (for other users)
    const rolesRef = collection(db, 'roles');
    const rolesUnsubscribe = onSnapshot(rolesRef, (snapshot) => {
      fetchLeaderboards();
    }, (error) => {
      console.error('Error listening to roles:', error);
    });
    unsubscribers.push(rolesUnsubscribe);
    
    // Initial data fetch
    const fetchInitialData = async () => {
      try {
        await fetchStreak();
        await fetchStudyTimeData();
        await fetchLeaderboards();
        await fetchAllRolesStreakHistory();
        await fetchUploadedFiles();
        
        // Run the one-time streak update for all users
        await updateAllUsersStreakData();
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching initial data:', error);
        setError('Failed to load dashboard data');
        setLoading(false);
      }
    };
    
    fetchInitialData();
    
    // Clean up all listeners on component unmount
    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe());
    };
  }, [currentUser, navigate]);

  // Fetch user's streak data
  const fetchStreak = async () => {
    if (!currentUser) return;

    try {
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        setUserStreak(userData.streak || 0);
        
        // Get streak history for graph
        const streakHistoryRef = collection(db, 'users', currentUser.uid, 'streakHistory');
        const streakHistorySnapshot = await getDocs(streakHistoryRef);
        
        // Create a set of dates when the user logged study time
        const streakDaysSet = new Set();
        streakHistorySnapshot.forEach(doc => {
          streakDaysSet.add(doc.id); // Only store the date
        });
        
        // Get all dates from the streak history
        const allDates = [];
        streakHistorySnapshot.forEach(doc => {
          allDates.push(doc.id);
        });
        
        // Sort dates chronologically
        allDates.sort((a, b) => new Date(a) - new Date(b));
        
        // Prepare data for chart - using binary values (1 for days with streak, 0 for days without)
        const labels = allDates;
        const data = allDates.map(() => 1); // Each date in allDates represents a day with streak
        
        setStreakData({ labels, data });
      }
    } catch (error) {
      console.error('Error fetching streak:', error);
    }
  };

  // Fetch study time data for all users
  const fetchStudyTimeData = async () => {
    if (!currentUser) return;

    try {
      // Get all roles first
      const rolesRef = collection(db, 'roles');
      const rolesSnapshot = await getDocs(rolesRef);
      
      const allUsersData = [];
      const allLabels = new Set(); // To collect all unique dates
      
      // Process each role
      for (const roleDoc of rolesSnapshot.docs) {
        if (roleDoc.data().taken) {
          const userId = roleDoc.data().userId;
          const roleName = roleDoc.id;
          
          try {
            // Get study logs for this user
            const studyLogsRef = collection(db, 'studyLogs', userId, 'logs');
            const studyLogsSnapshot = await getDocs(studyLogsRef);
            
            const logs = [];
            studyLogsSnapshot.forEach(doc => {
              // Ensure we're using the document ID as the date (YYYY-MM-DD format)
              logs.push({
                date: doc.id,
                hours: parseFloat(doc.data().hours) || 0,
                topic: doc.data().topic || ''
              });
              allLabels.add(doc.id); // Add to our set of all dates
            });
            
            // Sort by date
            logs.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            // Add to our collection of all users data
            allUsersData.push({
              roleId: roleName,
              userId: userId,
              logs: logs
            });
          } catch (error) {
            console.error(`Error fetching study logs for ${roleName}:`, error);
          }
        }
      }
      
      // Convert labels set to array and sort
      const sortedLabels = Array.from(allLabels).sort((a, b) => new Date(a) - new Date(b));
      
      // For the current user, also set detailed study history
      const currentUserData = allUsersData.find(userData => userData.userId === currentUser.uid);
      if (currentUserData) {
        setDetailedStudyHistory(currentUserData.logs.map(log => ({
          date: log.date,
          hours: log.hours,
          topic: log.topic,
          timestamp: new Date(log.date),
          lastUpdated: new Date(log.date)
        })));
      }
      
      // Set the study time data with all labels
      setStudyTimeData({ 
        labels: sortedLabels, 
        data: currentUserData ? sortedLabels.map(date => {
          const log = currentUserData.logs.find(log => log.date === date);
          return log ? log.hours : null;
        }) : [],
        allUsersData: allUsersData
      });
    } catch (error) {
      console.error('Error fetching study time data:', error);
    }
  };

  // Fetch streak history for all roles and build binary streak data (0/1 per day)
  const fetchAllRolesStreakHistory = async () => {
    try {
      // Get all roles
      const rolesRef = collection(db, 'roles');
      const rolesSnapshot = await getDocs(rolesRef);

      const allRolesData = [];
      const allLabels = new Set(); // To collect all unique dates

      // Process each role
      for (const roleDoc of rolesSnapshot.docs) {
        if (roleDoc.data().taken) {
          const userId = roleDoc.data().userId;
          const roleName = roleDoc.id;
          try {
            // Get streak history for this user
            const streakHistoryRef = collection(db, 'users', userId, 'streakHistory');
            const streakHistorySnapshot = await getDocs(streakHistoryRef);
            const streakDaysSet = new Set();
            streakHistorySnapshot.forEach(doc => {
              streakDaysSet.add(doc.id); // Only need the date
              allLabels.add(doc.id);
            });
            allRolesData.push({
              label: roleName,
              userId,
              streakDays: streakDaysSet
            });
          } catch (error) {
            console.error(`Error fetching streak history for ${roleName}:`, error);
          }
        }
      }

      // Convert labels set to array and sort
      const sortedLabels = Array.from(allLabels).sort((a, b) => new Date(a) - new Date(b));

      // Format dates for display (MM-DD format)
      const formattedLabels = sortedLabels.map(date => formatDateToMonthDay(date));

      // Create a mapping between formatted labels and original dates for reference
      const dateMapping = {};
      sortedLabels.forEach((date, index) => {
        dateMapping[formattedLabels[index]] = date;
      });

      // Build binary streak data for each role
      const datasets = allRolesData.map((role, idx) => ({
        label: role.label,
        data: formattedLabels.map(formattedDate => {
          // Get the original date from our mapping
          const originalDate = dateMapping[formattedDate];
          // Check if this date is in the user's streak days
          return role.streakDays.has(originalDate) ? 1 : 0;
        }),
        fill: false,
        borderColor: chartColors.backgroundColors[idx % chartColors.backgroundColors.length],
        backgroundColor: chartColors.backgroundColors[idx % chartColors.backgroundColors.length],
        tension: 0.2,
        pointRadius: 4,
        pointHoverRadius: 6,
        spanGaps: true
      }));

      setStreakChartData({
        labels: formattedLabels,
        datasets: datasets
      });
      setAllRolesStreakData(allRolesData); // preserve for other uses
    } catch (error) {
      console.error('Error fetching all roles streak history:', error);
    }
  };

  // Fetch leaderboards - simplified direct approach
  const fetchLeaderboards = async () => {
    try {
      console.log('Fetching leaderboard data...');
      
      // Get all roles - this will include ALL registered users
      const rolesRef = collection(db, 'roles');
      const rolesSnapshot = await getDocs(rolesRef);
      
      // Calculate date ranges
      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      
      const monthAgo = new Date(now);
      monthAgo.setMonth(now.getMonth() - 1);
      
      // Create arrays to store user data
      const weeklyData = [];
      const monthlyData = [];
      
      // Get all roles first - we'll show ALL roles in the leaderboard
      const allRoles = [];
      rolesSnapshot.forEach(doc => {
        if (doc.data().taken) {
          allRoles.push({
            id: doc.id,
            userId: doc.data().userId
          });
        }
      });
      
      console.log('All roles:', allRoles);
      
      // Process each role
      for (const role of allRoles) {
        const userId = role.userId;
        const roleName = role.id;
        
        try {
          // Get user data
          const userDocRef = doc(db, 'users', userId);
          const userDoc = await getDoc(userDocRef);
          
          if (userDoc.exists()) {
            const userData = userDoc.data();
            const userEmail = userData.email || 'No email';
            const userStreak = userData.streak || 0;
            
            // Get all study logs for this user
            const studyLogsRef = collection(db, 'studyLogs', userId, 'logs');
            const studyLogsSnapshot = await getDocs(studyLogsRef);
            
            let weeklyHours = 0;
            let monthlyHours = 0;
            
            // Calculate weekly and monthly hours
            studyLogsSnapshot.forEach(doc => {
              try {
                const logDate = new Date(doc.id);
                const hours = parseFloat(doc.data().hours) || 0;
                
                if (logDate >= weekAgo) {
                  weeklyHours += hours;
                }
                
                if (logDate >= monthAgo) {
                  monthlyHours += hours;
                }
              } catch (err) {
                console.error('Error processing log:', err);
              }
            });
            
            // Format hours to 1 decimal place
            weeklyHours = parseFloat(weeklyHours.toFixed(1));
            monthlyHours = parseFloat(monthlyHours.toFixed(1));
            
            console.log(`User ${roleName}: Weekly=${weeklyHours}, Monthly=${monthlyHours}`);
            
            // Add to weekly leaderboard
            weeklyData.push({
              id: userId,
              role: roleName,
              email: userEmail,
              streak: userStreak,
              weeklyHours: weeklyHours
            });
            
            // Add to monthly leaderboard (separate object)
            monthlyData.push({
              id: userId,
              role: roleName,
              email: userEmail,
              streak: userStreak,
              monthlyHours: monthlyHours
            });
          }
        } catch (error) {
          console.error(`Error processing user ${roleName}:`, error);
          // Still add the user to leaderboards with 0 hours
          weeklyData.push({
            id: userId,
            role: roleName,
            email: 'Error loading user',
            streak: 0,
            weeklyHours: 0
          });
          
          monthlyData.push({
            id: userId,
            role: roleName,
            email: 'Error loading user',
            streak: 0,
            monthlyHours: 0
          });
        }
      }
      
      // Sort weekly leaderboard (streak first, then hours)
      weeklyData.sort((a, b) => {
        if (a.streak !== b.streak) {
          return b.streak - a.streak; // Higher streak first
        }
        return b.weeklyHours - a.weeklyHours; // Then higher hours
      });
      
      // Sort monthly leaderboard (streak first, then hours)
      monthlyData.sort((a, b) => {
        if (a.streak !== b.streak) {
          return b.streak - a.streak; // Higher streak first
        }
        return b.monthlyHours - a.monthlyHours; // Then higher hours
      });
      
      console.log('Weekly leaderboard:', weeklyData);
      console.log('Monthly leaderboard:', monthlyData);
      
      // Update state
      setWeeklyLeaderboard(weeklyData);
      setMonthlyLeaderboard(monthlyData);
    } catch (error) {
      console.error('Error fetching leaderboards:', error);
    }
  };

  // Fetch uploaded files to analyze file sizes
  const fetchUploadedFiles = async () => {
    try {
      if (!currentUser) return;

      // Get all study logs for the current user
      const logsRef = collection(db, 'studyLogs', currentUser.uid, 'logs');
      const logsSnapshot = await getDocs(logsRef);
      
      const files = [];
      
      // Extract file data from each log
      logsSnapshot.forEach(doc => {
        const logData = doc.data();
        if (logData.file) {
          // Check if the doc.id is a valid date format (YYYY-MM-DD) or extract timestamp from log_ID format
          let dateValue = doc.id;
          if (doc.id.startsWith('log_')) {
            // Extract the timestamp part and create a proper date
            const timestamp = doc.id.split('log_')[1];
            if (timestamp && !isNaN(Number(timestamp))) {
              // Convert timestamp to a proper date string
              const date = new Date(Number(timestamp));
              dateValue = formatDate(date);
            }
          }
          
          files.push({
            ...logData.file,
            date: dateValue
          });
        }
      });
      
      setUploadedFiles(files);
      console.log('Fetched uploaded files:', files);
    } catch (error) {
      console.error('Error fetching uploaded files:', error);
    }
  };

  // Handle file upload
  const handleFileUpload = async (file) => {
    if (!file) return null;
    
    try {
      // Create a unique filename with timestamp and original name
      const timestamp = new Date().getTime();
      const fileExtension = file.name.split('.').pop();
      const fileName = `${timestamp}_${file.name}`;
      
      // Create a storage reference
      const storageRef = ref(storage, `study-files/${currentUser.uid}/${fileName}`);
      
      // Upload the file with progress monitoring
      const uploadTask = uploadBytesResumable(storageRef, file);
      
      // Set up progress monitoring
      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          setFileUploadProgress(progress);
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
      
      // Reset progress
      setFileUploadProgress(0);
      
      return {
        name: file.name,
        type: file.type,
        size: file.size,
        url: downloadURL,
        path: `study-files/${currentUser.uid}/${fileName}`
      };
    } catch (error) {
      console.error('Error in file upload:', error);
      setError('Failed to upload file');
      setFileUploadProgress(0);
      return null;
    }
  };

  // Log study hours
  const handleLogStudy = async (e) => {
    e.preventDefault();
    
    if (loading) return;
    
    if (!studyHours || !studyTopic) {
      setError('Please enter both hours and topic');
      return;
    }
    
    setLoading(true);
    setError('');
    
    try {
      const hours = parseFloat(studyHours);
      if (isNaN(hours) || hours <= 0 || hours > 24) {
        throw new Error('Hours must be a positive number up to 24');
      }
      
      const today = getTodayIST();
      let fileData = null;
      
      // Handle file upload if a file was selected
      if (uploadedFile) {
        fileData = await handleFileUpload(uploadedFile);
      }
      
      // Create or update study log
      const logRef = doc(db, 'studyLogs', currentUser.uid, 'logs', today);
      const now = Timestamp.now();
      
      // Check if log already exists for today
      const existingLog = await getDoc(logRef);
      
      if (existingLog.exists()) {
        // Get existing data
        const existingData = existingLog.data();
        const existingHours = parseFloat(existingData.hours) || 0;
        const existingTopic = existingData.topic || '';
        
        // Calculate total hours (add new hours to existing)
        const totalHours = existingHours + hours;
        
        // Check if total exceeds 24 hours
        if (totalHours > 24) {
          throw new Error('Total study hours for today cannot exceed 24 hours');
        }
        
        // Update existing log with combined data
        await setDoc(logRef, {
          hours: totalHours,
          // Combine topics if there's an existing topic
          topic: existingTopic ? `${existingTopic}, ${studyTopic}` : studyTopic,
          lastUpdated: now,
          ...(fileData ? { file: fileData } : {})
        }, { merge: true });
      } else {
        // Create new log
        await setDoc(logRef, {
          hours: hours,
          topic: studyTopic,
          timestamp: now,
          lastUpdated: now,
          ...(fileData ? { file: fileData } : {})
        });
        
        // Update streak
        const userRef = doc(db, 'users', currentUser.uid);
        const userDoc = await getDoc(userRef);
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          const newStreak = (userData.streak || 0) + 1;
          
          await setDoc(userRef, {
            streak: newStreak,
            lastStudyDate: today
          }, { merge: true });
          
          // Add to streak history
          const streakHistoryRef = doc(db, 'users', currentUser.uid, 'streakHistory', today);
          await setDoc(streakHistoryRef, {
            streak: newStreak,
            date: today
          });
          
          setUserStreak(newStreak);
        }
      }
      
      // Reset form
      setStudyHours('');
      setStudyTopic('');
      setUploadedFile(null);
      setFileUploadProgress(0);
      
      setLoading(false);
    } catch (error) {
      console.error('Error logging study:', error);
      setError(error.message || 'Failed to log study time');
      setLoading(false);
    }
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

  // Handle profile photo upload
  const handleProfilePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setLoading(true);
    setError('');
    
    try {
      // Create a storage reference
      const storageRef = ref(storage, `profile-photos/${currentUser.uid}`);
      
      // Upload the file
      await uploadBytes(storageRef, file);
      
      // Get the download URL
      const photoURL = await getDownloadURL(storageRef);
      
      // Update the user document in Firestore with the photo URL
      const userDocRef = doc(db, 'users', currentUser.uid);
      await setDoc(userDocRef, { photoURL }, { merge: true });
      
      // Update the local state to reflect the change without requiring a page refresh
      setCurrentUser(prevUser => ({
        ...prevUser,
        photoURL
      }));
      
      setLoading(false);
    } catch (error) {
      console.error('Error uploading profile photo:', error);
      setError('Failed to upload profile photo');
      setLoading(false);
    }
  };

  // Toggle sidebar
  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  // Close sidebar when clicking outside
  const handleOutsideClick = useCallback((e) => {
    // If sidebar is open and the click is outside the sidebar
    if (sidebarOpen && !e.target.closest('.sidebar') && !e.target.closest('.hamburger-menu')) {
      setSidebarOpen(false);
    }
  }, [sidebarOpen]);

  // Add event listener for outside clicks
  useEffect(() => {
    document.addEventListener('mousedown', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [handleOutsideClick]);

  // Calculate total study hours
  const calculateTotalHours = () => {
    if (!studyTimeData.data || !studyTimeData.data.length) return 0;
    
    // Filter out null values and ensure all values are numbers before summing
    const validHours = studyTimeData.data.filter(hours => hours !== null && !isNaN(parseFloat(hours)));
    
    if (validHours.length === 0) return 0;
    
    return validHours.reduce((sum, hours) => sum + parseFloat(hours), 0).toFixed(1);
  };

  // Format date to show only month and date (MM-DD)
  const formatDateToMonthDay = (dateString) => {
    try {
      // Check if dateString is valid
      if (!dateString || dateString === 'undefined' || dateString === 'null') {
        return 'Invalid date';
      }
      
      // Handle ISO date strings (YYYY-MM-DD)
      if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const parts = dateString.split('-');
        return `${parts[1]}-${parts[2]}`; // Return MM-DD directly
      }
      
      // Otherwise, try to create a date object
      const date = new Date(dateString);
      
      // Check if date is valid
      if (isNaN(date.getTime())) {
        console.error('Invalid date:', dateString);
        return 'Invalid date';
      }
      
      return `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
    } catch (error) {
      console.error('Error formatting date to month-day:', error, dateString);
      return 'Error';
    }
  };

  // Use streakChartData directly from fetchAllRolesStreakHistory
  const streakChartConfig = {
    labels: streakChartData.labels ? streakChartData.labels.slice(-30).map(formatDateToMonthDay) : [], // Last 30 days
    datasets: streakChartData.datasets ? streakChartData.datasets.map(dataset => ({
      ...dataset,
      data: dataset.data.slice(-30).map(value => value === null || value === undefined ? 0 : value) // Replace null/undefined with 0
    })) : []
  };

  const studyTimeChartData = {
    labels: studyTimeData.labels ? studyTimeData.labels.slice(-14).map(formatDateToMonthDay) : [], // Last 14 days
    datasets: [
      // First include the current user's study hours
      {
        label: 'You',
        data: studyTimeData.data ? studyTimeData.data.slice(-14).map(value => value === null ? 0 : value) : [], // Replace null with 0
        borderColor: chartColors.borderColors[0],
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointBackgroundColor: chartColors.borderColors[0],
        pointRadius: 4,
        pointHoverRadius: 6,
        tension: 0.3
      },
      // Then include other users' study hours
      ...(studyTimeData.allUsersData ? studyTimeData.allUsersData
        .filter(userData => userData.userId !== currentUser.uid) // Exclude current user
        .map((userData, index) => {
          // Get a different color for each user
          const colorIndex = (index + 1) % chartColors.borderColors.length;
          
          return {
            label: userData.roleId,
            data: studyTimeData.labels.slice(-14).map(date => {
              // Find the hours value for this date, or return 0 if not found (instead of null)
              const entry = userData.logs.find(log => log.date === date);
              return entry ? entry.hours : 0; // Return 0 instead of null
            }),
            borderColor: chartColors.borderColors[colorIndex],
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointBackgroundColor: chartColors.borderColors[colorIndex],
            pointRadius: 4,
            pointHoverRadius: 6,
            tension: 0.3
          };
        }) : [])
    ]
  };

  // Prepare data for weekly comparison chart
  const weeklyComparisonData = {
    labels: weeklyLeaderboard.slice(0, 5).map(user => user.role),
    datasets: [
      {
        label: 'Weekly Hours',
        data: weeklyLeaderboard.slice(0, 5).map(user => user.weeklyHours),
        backgroundColor: chartColors.backgroundColors,
        borderColor: chartColors.borderColors,
        borderWidth: 1,
      },
    ],
  };

  // Prepare data for file size distribution chart
  const fileSizeDistributionData = {
    labels: ['<10MB', '10-20MB', '20-50MB', '>50MB'],
    datasets: [
      {
        data: [
          uploadedFiles.filter(file => file && file.size < 10 * 1024 * 1024).length,
          uploadedFiles.filter(file => file && file.size >= 10 * 1024 * 1024 && file.size < 20 * 1024 * 1024).length,
          uploadedFiles.filter(file => file && file.size >= 20 * 1024 * 1024 && file.size < 50 * 1024 * 1024).length,
          uploadedFiles.filter(file => file && file.size >= 50 * 1024 * 1024).length,
        ],
        backgroundColor: [
          'rgba(94, 114, 228, 0.8)',
          'rgba(130, 94, 228, 0.8)',
          'rgba(251, 99, 64, 0.8)',
          'rgba(45, 206, 137, 0.8)',
        ],
        borderColor: [
          'rgba(94, 114, 228, 1)',
          'rgba(130, 94, 228, 1)',
          'rgba(251, 99, 64, 1)',
          'rgba(45, 206, 137, 1)',
        ],
        borderWidth: 1,
      },
    ],
  };

  // Utility to get min/max from chart data
  const getYDomain = (chartData) => {
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    chartData.datasets.forEach(ds => {
      ds.data.forEach(val => {
        if (typeof val === 'number' && !isNaN(val)) {
          if (val < min) min = val;
          if (val > max) max = val;
        }
      });
    });
    // Add a little padding
    if (min === Number.POSITIVE_INFINITY) min = 0;
    if (max === Number.NEGATIVE_INFINITY) max = 1;
    if (min === max) {
      min = Math.max(0, min - 1);
      max = max + 1;
    } else {
      min = Math.floor(min - 0.1 * Math.abs(max - min));
      max = Math.ceil(max + 0.1 * Math.abs(max - min));
    }
    return { min, max };
  };

  // Chart options
  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        top: 5,
        right: 5,
        bottom: 5,
        left: 10
      }
    },
    plugins: {
      legend: {
        position: 'top',
        labels: {
          boxWidth: 12,
          font: {
            size: 10
          },
          padding: 15
        }
      },
      title: {
        display: false
      },
      tooltip: {
        callbacks: {
          title: function(tooltipItems) {
            return tooltipItems[0].label;
          },
          label: function(context) {
            return `${context.dataset.label}: ${context.raw !== null && context.raw !== undefined ? context.raw : '0'}`;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        min: 0,
        max: 1,
        ticks: {
          callback: function(value) {
            return value === 0 || value === 1 ? value : '';
          },
          count: 2,
          padding: -5
        },
        grid: {
          drawBorder: true,
          color: 'rgba(200, 200, 200, 0.3)'
        },
        title: {
          display: true,
          text: 'Streak Days',
          padding: {
            bottom: 5
          }
        }
      },
      x: {
        ticks: {
          maxRotation: 45,  // Rotate date labels for better readability
          minRotation: 45,
          padding: -5
        },
        grid: {
          drawBorder: true,
          color: 'rgba(200, 200, 200, 0.3)'
        },
        title: {
          display: true,
          text: 'Date',
          padding: {
            top: 0
          }
        }
      }
    },
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: false,
      },
    },
    scales: {
      y: {
        beginAtZero: true,
      },
    },
  };

  const doughnutChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          boxWidth: 15,
          padding: 15,
          font: {
            size: 12
          }
        }
      },
      title: {
        display: false
      }
    },
  };

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="dashboard-header">
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
          <h2>Streak Learn</h2>
        </div>
        <div className="header-right">
          <button className="history-button" onClick={() => setShowHistoryModal(true)}>
            View History
          </button>
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
            <div className="profile-photo-container" style={{ display: 'block', position: 'relative', zIndex: 50 }}>
              {currentUser?.photoURL ? (
                <img 
                  src={currentUser.photoURL} 
                  alt="Profile" 
                  className="profile-photo" 
                  style={{ 
                    display: 'block', 
                    width: '100%', 
                    height: '100%', 
                    objectFit: 'cover',
                    borderRadius: '50%',
                    border: '2px solid #4a6bff'
                  }}
                />
              ) : (
                <div className="profile-photo-placeholder">
                  {currentUser?.email?.charAt(0).toUpperCase() || '?'}
                </div>
              )}
              <input 
                type="file" 
                id="profile-photo-upload" 
                style={{ display: 'none' }} 
                onChange={handleProfilePhotoUpload}
                accept="image/*"
              />
              <label htmlFor="profile-photo-upload" className="profile-photo-label">
                Change Photo
              </label>
            </div>
            <div className="sidebar-user-info">
              <h3>{currentUser?.role || 'User'}</h3>
              <p className="user-email text-center">{currentUser?.email}</p>
            </div>
          </div>
        </div>
        <nav className="sidebar-nav">
          <ul>
            <li><button className="nav-button active" onClick={() => navigate('/dashboard')}>🏠 <span>Dashboard</span></button></li>
            <li><button className="nav-button" onClick={() => navigate('/messaging')}>✉️ <span>Messages</span></button></li>
            <li><button className="nav-button" onClick={() => navigate('/files')}>📋 <span>Logs</span></button></li>
            <li><button className="nav-button" onClick={() => navigate('/posts')}>📝 <span>Posts</span></button></li>
            <li><button className="nav-button" onClick={() => navigate('/deadlines')}>⏰ <span>Deadlines</span></button></li>
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
      <div className="main-content-wrapper">
        {/* Stats Overview Section */}
        <div className="stats-container">
          <div style={{ backgroundColor: 'white' }} className="stat-card streak-card">
            <h3>Current Streak</h3>
            <p className="">{userStreak}</p>
          </div>
          <div className="stat-card">
            <h3>Total Hours</h3>
            <p className="stat-value">{calculateTotalHours()}</p>
          </div>
          <div className="stat-card">
            <h3>Weekly Rank</h3>
            <p className="stat-value">
              {weeklyLeaderboard.findIndex(user => user.id === currentUser?.uid) + 1 || '-'}
            </p>
          </div>
        </div>

        {/* Log Study Section - Compact */}
        <section className="log-study-section">
          <form className="log-form" onSubmit={handleLogStudy}>
            <div className="form-group">
              <input
                type="number"
                step="0.1"
                min="0.1"
                max="24"
                value={studyHours}
                onChange={(e) => setStudyHours(e.target.value)}
                required
                placeholder="Hours"
              />
            </div>
            <div className="form-group">
              <input
                type="text"
                value={studyTopic}
                onChange={(e) => setStudyTopic(e.target.value)}
                required
                placeholder="Topic"
              />
            </div>
            <div className="form-group">
              <input
                type="file"
                onChange={(e) => setUploadedFile(e.target.files[0])}
                className="file-input"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="file-label">
                {uploadedFile ? uploadedFile.name : <span>📎</span>}
              </label>
              {fileUploadProgress > 0 && fileUploadProgress < 100 && (
                <div className="upload-progress-container">
                  <div 
                    className="upload-progress-bar" 
                    style={{ width: `${fileUploadProgress}%` }}
                  ></div>
                  <span className="upload-progress-text">{Math.round(fileUploadProgress)}%</span>
                </div>
              )}
            </div>
            <button className="submit-button" type="submit" disabled={loading}>
              {loading ? '...' : 'Log'}
            </button>
          </form>
        </section>
        
        {/* Dashboard Main Content */}
        <div className="dashboard-main-content">
          <div className="dashboard-left-column">
            {/* Charts Row */}
            <div className="charts-row">
              <div className="chart-card" title="Daily Study Hours" onClick={() => setExpandedChart('study')} style={{ cursor: 'pointer' }}>
                <div className="chart-wrapper" style={{ height: '300px', marginBottom: '20px' }}>
                  <Line data={studyTimeChartData} options={{
                    ...lineChartOptions,
                    scales: {
                      ...lineChartOptions.scales,
                      y: {
                        ...lineChartOptions.scales.y,
                        min: 0,
                        max: 10,
                        ticks: {
                          ...lineChartOptions.scales.y.ticks,
                          callback: undefined,
                          stepSize: 1,
                        },
                        title: {
                          ...lineChartOptions.scales.y.title,
                          text: 'Study Hours',
                        }
                      }
                    }
                  }} />
                </div>
              </div>
              <div className="chart-card" title="Streak History" onClick={() => setExpandedChart('streak')} style={{ cursor: 'pointer' }}>
                <div className="chart-wrapper" style={{ height: '300px', marginBottom: '20px' }}>
                  <Line data={streakChartData} options={{
                    ...lineChartOptions,
                    scales: {
                      ...lineChartOptions.scales,
                      y: {
                        ...lineChartOptions.scales.y,
                        min: 0,
                        max: 1,
                        ticks: {
                          ...lineChartOptions.scales.y.ticks,
                          callback: function(value) { return value === 0 || value === 1 ? value : ''; },
                          count: 2,
                          stepSize: undefined,
                        },
                        title: {
                          ...lineChartOptions.scales.y.title,
                          text: 'Streak Days',
                        }
                      }
                    }
                  }} />
                </div>
              </div>
            </div>

            {/* Expanded Chart Modal */}
            {expandedChart && (
              <div className="chart-modal-overlay" onClick={() => setExpandedChart(null)}>
                <div className="chart-modal" onClick={e => e.stopPropagation()}>
                  <button className="close-modal-btn" onClick={() => setExpandedChart(null)}>&times;</button>
                  {expandedChart === 'study' && (() => {
                    const yDomain = getYDomain(studyTimeChartData);
                    return (
                      <Line
                        data={studyTimeChartData}
                        options={{
                          ...lineChartOptions,
                          scales: {
                            ...lineChartOptions.scales,
                            y: {
                              ...lineChartOptions.scales.y,
                              min: yDomain.min,
                              max: yDomain.max,
                              ticks: {
                                ...lineChartOptions.scales.y.ticks,
                                callback: undefined,
                                stepSize: undefined,
                              },
                              title: {
                                ...lineChartOptions.scales.y.title,
                                text: 'Study Hours',
                              }
                            }
                          }
                        }}
                        height={600}
                        width={1000}
                      />
                    );
                  })()}
                  {expandedChart === 'streak' && (() => {
                    const yDomain = getYDomain(streakChartData);
                    return (
                      <Line
                        data={streakChartData}
                        options={{
                          ...lineChartOptions,
                          scales: {
                            ...lineChartOptions.scales,
                            y: {
                              ...lineChartOptions.scales.y,
                              min: yDomain.min,
                              max: yDomain.max,
                              ticks: {
                                ...lineChartOptions.scales.y.ticks,
                                callback: undefined,
                                stepSize: undefined,
                              },
                              title: {
                                ...lineChartOptions.scales.y.title,
                                text: 'Streak Days',
                              }
                            }
                          }
                        }}
                        height={600}
                        width={1000}
                      />
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Leaderboards */}
            <div className="leaderboards-container">
              <section className="leaderboard-section">
                <h2>Weekly Leaderboard</h2>
                <table className="leaderboard-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>User</th>
                      <th>Streak</th>
                      <th>Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weeklyLeaderboard.slice(0, 5).map((user, index) => (
                      <tr key={user.id} className={user.id === currentUser?.uid ? 'current-user' : ''}>
                        <td>{index + 1}</td>
                        <td>{user.role}</td>
                        <td>{user.streak}</td>
                        <td>{user.weeklyHours.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="leaderboard-section">
                <h2>Monthly Leaderboard</h2>
                <table className="leaderboard-table">
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>User</th>
                      <th>Streak</th>
                      <th>Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyLeaderboard.slice(0, 5).map((user, index) => (
                      <tr key={user.id} className={user.id === currentUser?.uid ? 'current-user' : ''}>
                        <td>{index + 1}</td>
                        <td>{user.role}</td>
                        <td>{user.streak}</td>
                        <td>{user.monthlyHours.toFixed(1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>
          </div>
          
          <div className="dashboard-right-column">
            {/* Analytics Charts */}
            <div className="chart-card" title="File Size Distribution">
              <div className="chart-wrapper donut-wrapper">
                <h3 className="chart-title">File Size Distribution</h3>
                <Doughnut data={fileSizeDistributionData} options={{
                  ...doughnutChartOptions,
                  plugins: {
                    ...doughnutChartOptions.plugins,
                    legend: {
                      ...doughnutChartOptions.plugins.legend,
                      position: 'right',
                      labels: {
                        boxWidth: 15,
                        padding: 15,
                        font: {
                          size: 12
                        }
                      }
                    },
                    title: {
                      display: false
                    }
                  }
                }} />
              </div>
            </div>
            
            <div className="chart-card" title="Top 5 Weekly Comparison">
              <div className="chart-wrapper">
                <Bar data={weeklyComparisonData} options={barChartOptions} />
              </div>
            </div>
          </div>
        </div>
        
        {/* Study History Modal */}
        {showHistoryModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-header">
                <h2>Study History</h2>
                <button className="close-button" onClick={() => setShowHistoryModal(false)}>&times;</button>
              </div>
              <div className="modal-body">
                {detailedStudyHistory.length > 0 ? (
                  <table className="history-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Hours</th>
                        <th>Topic</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailedStudyHistory.map((log, index) => (
                        <tr key={index}>
                          <td>{log.date}</td>
                          <td>
                            {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {log.lastUpdated && log.lastUpdated.getTime() !== log.timestamp.getTime() && 
                              ` (Updated: ${log.lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`}
                          </td>
                          <td>{log.hours}</td>
                          <td>{log.topic}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p>No study history available yet. Start logging your study time!</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
