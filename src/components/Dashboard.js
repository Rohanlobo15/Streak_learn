import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
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
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import './Dashboard.css';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Title, Tooltip, Legend, ArcElement);

export default function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
  const [otherUsers, setOtherUsers] = useState([]);
  const [weeklyLeaderboard, setWeeklyLeaderboard] = useState([]);
  const [monthlyLeaderboard, setMonthlyLeaderboard] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [detailedStudyHistory, setDetailedStudyHistory] = useState([]);

  // Format date as YYYY-MM-DD in IST
  const formatDate = (date) => {
    try {
      const options = { timeZone: 'Asia/Kolkata' };
      const istDate = new Date(date.toLocaleString('en-US', options));
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
      fetchOtherUsers();
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
        await fetchOtherUsers();
        await fetchLeaderboards();
        await fetchAllRolesStreakHistory();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        
        const history = [];
        streakHistorySnapshot.forEach(doc => {
          history.push({
            date: doc.id,
            streak: doc.data().streak
          });
        });
        
        // Sort by date
        history.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Prepare data for chart
        const labels = history.map(item => item.date);
        const data = history.map(item => item.streak);
        
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
        data: currentUserData?.logs.map(log => log.hours) || [],
        allUsersData: allUsersData
      });
    } catch (error) {
      console.error('Error fetching study time data:', error);
    }
  };

  // Fetch other users' data
  const fetchOtherUsers = async () => {
    try {
      const rolesRef = collection(db, 'roles');
      const rolesSnapshot = await getDocs(rolesRef);
      
      const usersData = [];
      const today = getTodayIST();
      const userPromises = [];
      
      for (const roleDoc of rolesSnapshot.docs) {
        if (roleDoc.data().taken && roleDoc.data().userId !== currentUser?.uid) {
          const userId = roleDoc.data().userId;
          const userPromise = (async () => {
            try {
              const userDocRef = doc(db, 'users', userId);
              const userDoc = await getDoc(userDocRef);
              
              if (userDoc.exists()) {
                const userData = userDoc.data();
                
                // Get today's study log if exists
                const todayLogRef = doc(db, 'studyLogs', userId, 'logs', today);
                const todayLogDoc = await getDoc(todayLogRef);
                
                usersData.push({
                  id: userId,
                  role: roleDoc.id,
                  email: userData.email,
                  streak: userData.streak || 0,
                  todayHours: todayLogDoc.exists() ? parseFloat(todayLogDoc.data().hours) || 0 : 0,
                  todayTopic: todayLogDoc.exists() ? todayLogDoc.data().topic : 'N/A'
                });
              }
            } catch (err) {
              console.error('Error processing user:', err);
            }
          })();
          
          userPromises.push(userPromise);
        }
      }
      
      // Wait for all user data to be processed
      await Promise.all(userPromises);
      
      // Sort by role name for consistent display
      usersData.sort((a, b) => a.role.localeCompare(b.role));
      
      setOtherUsers(usersData);
    } catch (error) {
      console.error('Error fetching other users:', error);
    }
  };

  // Fetch streak history for all roles
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
            
            const history = [];
            streakHistorySnapshot.forEach(doc => {
              history.push({
                date: doc.id,
                streak: doc.data().streak
              });
              allLabels.add(doc.id); // Add to our set of all dates
            });
            
            // Sort by date
            history.sort((a, b) => new Date(a.date) - new Date(b.date));
            
            // Add to our collection of all roles data
            allRolesData.push({
              roleId: roleName,
              userId: userId,
              history: history
            });
          } catch (error) {
            console.error(`Error fetching streak history for ${roleName}:`, error);
          }
        }
      }
      
      // Convert labels set to array and sort
      const sortedLabels = Array.from(allLabels).sort((a, b) => new Date(a) - new Date(b));
      
      // We don't need to store the recent labels separately as they're used directly in the chart data
      
      // Set the all roles streak data
      setAllRolesStreakData(allRolesData);
      
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

  // Log study hours
  const handleLogStudy = async (e) => {
    e.preventDefault();
    
    if (!studyHours || !studyTopic) {
      setError('Please enter both study hours and topic');
      return;
    }
    
    const newHours = parseFloat(studyHours);
    if (isNaN(newHours) || newHours <= 0) {
      setError('Please enter a valid number of hours');
      return;
    }
    
    try {
      setLoading(true);
      setError('');
      
      const today = getTodayIST();
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDoc = await getDoc(userDocRef);
      
      // Check if user already logged study today
      const todayLogRef = doc(db, 'studyLogs', currentUser.uid, 'logs', today);
      const todayLogDoc = await getDoc(todayLogRef);
      
      // Calculate total hours for today (add new hours to existing hours)
      let totalHours = newHours;
      let existingTopic = '';
      
      if (todayLogDoc.exists()) {
        const existingData = todayLogDoc.data();
        totalHours += existingData.hours || 0;
        existingTopic = existingData.topic || '';
      }
      
      // Check if total hours exceeds 24 hours per day limit
      if (totalHours > 24) {
        setError('You cannot log more than 24 hours of study time in a single day');
        setLoading(false);
        return;
      }
      
      // Update study log with combined hours
      await setDoc(todayLogRef, {
        hours: totalHours,
        // Combine topics if there's an existing topic
        topic: existingTopic ? `${existingTopic}, ${studyTopic}` : studyTopic,
        timestamp: Timestamp.now(),
        lastUpdated: Timestamp.now()
      });
      
      // Update streak if first log today
      if (!todayLogDoc.exists()) {
        const userData = userDoc.data();
        const lastLogDate = userData.lastLogDate ? new Date(userData.lastLogDate) : null;
        const todayDate = new Date(today);
        const yesterdayDate = new Date(todayDate);
        yesterdayDate.setDate(todayDate.getDate() - 1);
        const yesterdayString = formatDate(yesterdayDate);
        
        let newStreak = userData.streak || 0;
        
        // If last log was yesterday, increment streak
        if (lastLogDate && formatDate(lastLogDate) === yesterdayString) {
          newStreak += 1;
        } 
        // If no log yesterday but logged today, reset streak to 1
        else if (!lastLogDate || formatDate(lastLogDate) !== today) {
          newStreak = 1;
        }
        
        // Update user document with new streak and last log date
        await setDoc(userDocRef, {
          ...userData,
          streak: newStreak,
          lastLogDate: today
        }, { merge: true });
        
        // Add to streak history
        const streakHistoryRef = doc(db, 'users', currentUser.uid, 'streakHistory', today);
        await setDoc(streakHistoryRef, {
          streak: newStreak,
          timestamp: Timestamp.now()
        });
        
        setUserStreak(newStreak);
      }
      
      // Reset form
      setStudyHours('');
      setStudyTopic('');
      setLoading(false);
      
      // The real-time listeners will automatically update the UI
      // No need for manual refreshes
    } catch (error) {
      console.error('Error logging study:', error);
      setError('Failed to log study time');
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

  // Calculate total study hours
  const calculateTotalHours = () => {
    if (!studyTimeData.data.length) return 0;
    return studyTimeData.data.reduce((sum, hours) => sum + parseFloat(hours), 0).toFixed(1);
  };

  // Format date to show only month and date (MM-DD)
  const formatDateToMonthDay = (dateString) => {
    const date = new Date(dateString);
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`;
  };

  // Prepare data for streak history chart (right side, 0/1)
  const streakChartData = {
    labels: streakData.labels.slice(-30).map(formatDateToMonthDay), // Last 30 days
    datasets: [
      {
        label: currentUser?.role || 'Your Streak',
        data: streakData.data.slice(-30),
        borderColor: chartColors.primary,
        backgroundColor: 'rgba(74, 107, 255, 0.1)',
        fill: false,
        tension: 0.4,
        pointBackgroundColor: chartColors.primary,
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 4,
      },
      ...allRolesStreakData
        .filter(role => role.userId !== currentUser?.uid)
        .map((roleData, index) => {
          const colorIndex = (index % (chartColors.borderColors.length - 1)) + 1;
          return {
            label: roleData.roleId,
            data: streakData.labels.slice(-30).map(date => {
              const entry = roleData.history.find(h => h.date === date);
              return entry ? entry.streak : null;
            }),
            borderColor: chartColors.borderColors[colorIndex],
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.4,
            pointBackgroundColor: chartColors.borderColors[colorIndex],
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 3,
          };
        })
    ],
  };

  const studyTimeChartData = {
    labels: studyTimeData.labels.slice(-30).map(formatDateToMonthDay), // Last 30 days
    datasets: [
      // First include the current user's study hours
      {
        label: currentUser?.role || 'Your Hours',
        data: studyTimeData.data.slice(-30),
        borderColor: chartColors.borderColors[0],
        backgroundColor: 'transparent',
        borderWidth: 2,
        tension: 0.4,
        fill: false,
        pointBackgroundColor: chartColors.borderColors[0],
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 3,
      },
      // Then add all other users' study hours
      ...(studyTimeData.allUsersData || [])  
        .filter(userData => userData.userId !== currentUser?.uid) // Filter out current user
        .map((userData, index) => {
          // Get the color for this user (cycling through available colors)
          const colorIndex = (index % (chartColors.borderColors.length - 1)) + 1; // Skip first color
          
          return {
            label: userData.roleId,
            data: studyTimeData.labels.slice(-30).map(date => {
              // Find the hours value for this date, or return null if not found
              const entry = userData.logs.find(log => log.date === date);
              return entry ? entry.hours : null;
            }),
            borderColor: chartColors.borderColors[colorIndex],
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.4,
            fill: false,
            pointBackgroundColor: chartColors.borderColors[colorIndex],
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointRadius: 3,
          };
        })
    ],
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

  // Prepare data for streak distribution chart
  const streakDistributionData = {
    labels: ['1-7 days', '8-14 days', '15-30 days', '31+ days'],
    datasets: [
      {
        data: [
          monthlyLeaderboard.filter(user => user.streak >= 1 && user.streak <= 7).length,
          monthlyLeaderboard.filter(user => user.streak >= 8 && user.streak <= 14).length,
          monthlyLeaderboard.filter(user => user.streak >= 15 && user.streak <= 30).length,
          monthlyLeaderboard.filter(user => user.streak > 30).length,
        ],
        backgroundColor: chartColors.backgroundColors,
        borderColor: chartColors.borderColors,
        borderWidth: 1,
      },
    ],
  };

  // Chart options
  const lineChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        top: 10,
        right: 25,
        bottom: 20,
        left: 25
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
            return `${context.dataset.label}: ${context.raw || 'No data'}`;
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
          padding: 10
        },
        grid: {
          drawBorder: true,
          color: 'rgba(200, 200, 200, 0.3)'
        },
        title: {
          display: true,
          text: 'Streak Days',
          padding: {
            bottom: 10
          }
        }
      },
      x: {
        ticks: {
          maxRotation: 45,  // Rotate date labels for better readability
          minRotation: 45,
          padding: 10
        },
        grid: {
          drawBorder: true,
          color: 'rgba(200, 200, 200, 0.3)'
        },
        title: {
          display: true,
          text: 'Date',
          padding: {
            top: 10
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
      },
    },
  };

  return (
    <div className="dashboard-container">
      {/* Header Section */}
      <div className="dashboard-header">
        <div className="header-left">
          <button className="menu-button" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>
          <h1 className="dashboard-title">Street Learn</h1>
        </div>
        <div className="user-info">
          <p>Welcome, <span className="user-role">{currentUser?.role}</span></p>
          <button className="logout-button" onClick={handleLogout} disabled={loading}>Logout</button>
        </div>
      </div>
      
      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="user-avatar">
            <label htmlFor="profile-upload" className="avatar-upload">
              <div className="avatar-circle">
                {currentUser?.photoURL ? (
                  <img src={currentUser.photoURL} alt="Profile" className="profile-image" />
                ) : (
                  <span>+</span>
                )}
              </div>
              <input 
                type="file" 
                id="profile-upload" 
                className="profile-upload-input" 
                accept="image/*" 
                onChange={handleProfilePhotoUpload} 
              />
            </label>
          </div>
          <div className="sidebar-user-info">
            <h3>{currentUser?.role || 'User'}</h3>
            <p className="user-email text-center">{currentUser?.email}</p>
          </div>
        </div>
        <nav className="sidebar-nav">
          <ul>
            <li><button className="nav-button" onClick={() => navigate('/dashboard')}>🏠 <span>Dashboard</span></button></li>
            <li><button className="nav-button">✉️ <span>Messages</span></button></li>
          </ul>
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
              {weeklyLeaderboard.findIndex(user => user.id === currentUser?.uid) + 1 || '-'}/{weeklyLeaderboard.length}
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
              <div className="chart-card" title="Daily Study Hours">
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
              <div className="chart-card" title="Streak History">
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
            <div className="chart-card" title="Streak Distribution">
              <div className="chart-wrapper donut-wrapper">
                <Doughnut data={streakDistributionData} options={doughnutChartOptions} />
              </div>
            </div>
            
            <div className="chart-card" title="Top 5 Weekly Comparison">
              <div className="chart-wrapper">
                <Bar data={weeklyComparisonData} options={barChartOptions} />
              </div>
            </div>
            
            {/* View History Button */}
            <div className="view-history-container">
              <button onClick={() => setShowHistoryModal(true)} className="view-history-button">
                View History
              </button>
            </div>
          </div>
        </div>
        
        {/* Community Section - Full Width */}
        <div className="community-section" title="Community">
          {otherUsers.length > 0 ? (
            <div className="users-grid">
              {otherUsers.slice(0, 4).map(user => (
                <div key={user.id} className="user-card">
                  <h3>{user.role}</h3>
                  <p>Streak: <span>{user.streak}</span></p>
                  <p>Hours: <span>{user.todayHours}</span></p>
                </div>
              ))}
            </div>
          ) : (
            <p>No other users have logged study time yet.</p>
          )}
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
  );
}
