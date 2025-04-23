import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { db, initializeRoles } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

const AVAILABLE_ROLES = [
  'Rohan Lobo',
  'Vedanta',
  'Prabhas',
  'Ashif',
  'Sathwik',
  'Rohan K',
  'Shashank'
];

export default function SignUp() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedRole, setSelectedRole] = useState('');
  const [availableRoles, setAvailableRoles] = useState(AVAILABLE_ROLES);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const setupAndFetchRoles = async () => {
      try {
        if (!navigator.onLine) {
          setError('No internet connection. Please check your connection and try again.');
          return;
        }

        setError('');
        setLoading(true);

        // Initialize roles first
        await initializeRoles();

        // Then fetch available roles
        const rolesSnapshot = await getDocs(collection(db, 'roles'));
        const takenRoles = new Set();
        rolesSnapshot.forEach((doc) => {
          if (doc.data().taken) {
            takenRoles.add(doc.id);
          }
        });
        
        const available = AVAILABLE_ROLES.filter(role => !takenRoles.has(role));
        setAvailableRoles(available);
      } catch (error) {
        console.error('Error setting up roles:', error);
        if (error.message === 'No internet connection') {
          setError('No internet connection. Please check your connection and try again.');
        } else {
          setError('Failed to load available roles. Please try again later.');
        }
        // Set available roles to initial list if we can't fetch from Firebase
        setAvailableRoles(AVAILABLE_ROLES);
      } finally {
        setLoading(false);
      }
    };

    // Add online/offline event listeners
    const handleOnline = () => {
      setError('');
      setupAndFetchRoles();
    };

    const handleOffline = () => {
      setError('No internet connection. Please check your connection and try again.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    setupAndFetchRoles();

    // Cleanup event listeners
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();

    if (!selectedRole) {
      return setError('Please select a role');
    }

    try {
      setError('');
      setLoading(true);
      await signup(email, password, selectedRole);
      navigate('/dashboard'); // Redirect to dashboard after successful signup
    } catch (error) {
      setError('Failed to create an account: ' + error.message);
    }
    setLoading(false);
  }

  return (
    <div className="signup-container">
      <h2>Sign Up</h2>
      {error && <div className="error-message">{error}</div>}
      <div className="auth-switch">
        Already have an account? <button onClick={() => navigate('/login')} className="link-button">Log In</button>
      </div>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <div>
          <label>Select Role</label>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            required
          >
            <option value="">Choose a role...</option>
            {availableRoles.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={loading}>
          Sign Up
        </button>
      </form>
    </div>
  );
}
