import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { Pedometer, LightSensor } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_STEPS = 'activity_steps';
const STORAGE_CALORIES = 'activity_calories';
const STORAGE_DURATION = 'activity_duration';
const STORAGE_IS_TRACKING = 'activity_is_tracking';
const STORAGE_START_TIME = 'activity_start_time';
const STORAGE_LAST_SYNC_TIME = 'activity_last_sync_time';

export const useActivityTracker = () => {
  const [steps, setSteps] = useState(0);
  const [calories, setCalories] = useState(0);
  const [duration, setDuration] = useState(0); 
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isPedometerAvailable, setIsPedometerAvailable] = useState('checking');
  const [permissionStatus, setPermissionStatus] = useState<string>('undetermined');
  const [isWalking, setIsWalking] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [lux, setLux] = useState(100); // Default bright
  const [forcePocket, setForcePocket] = useState(false); // For web simulation
  
  // Track steps taken BEFORE the current start command
  const [baseSteps, setBaseSteps] = useState(0);
  const appState = useRef(AppState.currentState);
  const lastSyncTimeRef = useRef<number>(Date.now());

  // Load initial data
  useEffect(() => {
    const loadStats = async () => {
      try {
        const { granted, status } = await Pedometer.getPermissionsAsync();
        setPermissionStatus(status);

        const isAvailable = await Pedometer.isAvailableAsync();
        setIsPedometerAvailable(String(isAvailable));

        const savedSteps = await AsyncStorage.getItem(STORAGE_STEPS);
        const savedDuration = await AsyncStorage.getItem(STORAGE_DURATION);
        const savedTracking = await AsyncStorage.getItem(STORAGE_IS_TRACKING);
        const savedStartTime = await AsyncStorage.getItem(STORAGE_START_TIME);
        const savedLastSync = await AsyncStorage.getItem(STORAGE_LAST_SYNC_TIME);
        
        if (savedSteps) {
          const s = parseInt(savedSteps, 10);
          setSteps(s);
          setBaseSteps(s);
          setCalories(Math.round(s * 0.04));
        }
        if (savedDuration) {
          setDuration(parseInt(savedDuration, 10));
        }
        if (savedLastSync) {
           lastSyncTimeRef.current = parseInt(savedLastSync, 10);
        }
        if (savedTracking === 'true') {
          setIsTracking(true);
          if (savedStartTime) {
            setStartTime(parseInt(savedStartTime, 10));
            // Run a catch-up sync on first mount if tracking was active
            catchUpSteps(parseInt(savedLastSync || savedStartTime, 10));
          }
        }
      } catch (e) {
        console.error("Failed to load activity stats", e);
      }
    };
    loadStats();
  }, []);

  // Light Sensor Logic (Pocket Detection)
  useEffect(() => {
    let subscription: any;
    const subscribe = async () => {
      const isAvailable = await LightSensor.isAvailableAsync();
      if (!isAvailable) return;
      subscription = LightSensor.addListener(data => {
        setLux(data.illuminance);
      });
      LightSensor.setUpdateInterval(1000);
    };
    subscribe();
    return () => subscription?.remove();
  }, []);

  const isInPocket = lux < 10 || forcePocket;

  // Background/Lock Sync Logic
  const catchUpSteps = async (fromTime: number) => {
    if (Platform.OS === 'web') return;
    const isAvailable = await Pedometer.isAvailableAsync();
    if (!isAvailable) return;

    const now = new Date();
    const start = new Date(fromTime);
    
    try {
      const result = await Pedometer.getStepCountAsync(start, now);
      if (result.steps > 0) {
        setSteps(prev => {
          const total = prev + result.steps;
          setCalories(Math.round(total * 0.04));
          AsyncStorage.setItem(STORAGE_STEPS, total.toString());
          return total;
        });
      }
      lastSyncTimeRef.current = Date.now();
      AsyncStorage.setItem(STORAGE_LAST_SYNC_TIME, lastSyncTimeRef.current.toString());
    } catch (e) {
      console.log("Catch up failed (likely time range too small)", e);
    }
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active' && isTracking) {
        console.log('App has come to the foreground! Syncing steps...');
        catchUpSteps(lastSyncTimeRef.current);
      }
      appState.current = nextAppState;
    });

    return () => {
      subscription.remove();
    };
  }, [isTracking]);

  // Set up Pedometer Watcher (Foreground)
  useEffect(() => {
    let subscription: any;

    if (!isTracking) return;

    const subscribe = async () => {
      // Re-verify availability and check permission
      const isAvailable = await Pedometer.isAvailableAsync();
      if (!isAvailable) return;

      // watchStepCount returns steps SINCE the listener started
      subscription = Pedometer.watchStepCount(result => {
        // Gated Logic: Only count steps if in pocket
        if (!isInPocket) {
          setIsWalking(false);
          return;
        }

        // total = steps_before_start + steps_in_this_session
        const newTotalSteps = baseSteps + result.steps;
        const newCals = Math.round(newTotalSteps * 0.04);
        
        setSteps(newTotalSteps);
        setCalories(newCals);
        setIsWalking(true);
        
        // Persist
        lastSyncTimeRef.current = Date.now();
        AsyncStorage.setItem(STORAGE_STEPS, newTotalSteps.toString());
        AsyncStorage.setItem(STORAGE_CALORIES, newCals.toString());
        AsyncStorage.setItem(STORAGE_LAST_SYNC_TIME, lastSyncTimeRef.current.toString());
      });
    };

    subscribe();
    return () => {
      if (subscription) subscription.remove();
    };
  }, [isTracking, baseSteps]);

  // Duration & Simulation logic (Resilient to background/lock)
  useEffect(() => {
    let interval: any;
    if (isTracking && startTime) {
      interval = setInterval(() => {
        const now = Date.now();
        const newDuration = Math.floor((now - startTime) / 1000);
        
        // ONLY increment duration if in pocket and walking
        if (isInPocket && isWalking) {
           setDuration(newDuration);
           AsyncStorage.setItem(STORAGE_DURATION, newDuration.toString());
        }

        // Web/Simulator fallback for steps
        if (Platform.OS === 'web' || isPedometerAvailable === 'false') {
          // Gated Logic: Only simulate if in pocket state
          if (isInPocket) {
            setSteps(prev => {
              const nextSteps = prev + Math.floor(Math.random() * 3); // Sim 0-2 steps
              setCalories(Math.round(nextSteps * 0.04));
              AsyncStorage.setItem(STORAGE_STEPS, nextSteps.toString());
              return nextSteps;
            });
            setIsWalking(true);
          } else {
            setIsWalking(false);
          }
        }
      }, 1000);

      const timeout = setTimeout(() => {
        if (Platform.OS !== 'web' && isPedometerAvailable !== 'false') {
          setIsWalking(false);
        }
      }, 3000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [isTracking, startTime, isPedometerAvailable]);

  const toggleTracking = useCallback(async () => {
    const nextState = !isTracking;
    const now = Date.now();
    
    if (nextState) {
      // Starting tracking: Ensure we have permissions
      const { granted, status } = await Pedometer.requestPermissionsAsync();
      setPermissionStatus(status);
      if (!granted) return;

      // Absolute timing: set startTime to NOW minus current duration
      const newStart = now - (duration * 1000);
      setStartTime(newStart);
      await AsyncStorage.setItem(STORAGE_START_TIME, newStart.toString());

      // Set baseSteps to current steps count so result.steps starts from here
      setBaseSteps(steps); 
    } else {
      // Stopping tracking: clear startTime but preserve duration state
      setStartTime(null);
      await AsyncStorage.removeItem(STORAGE_START_TIME);
    }

    setIsTracking(nextState);
    await AsyncStorage.setItem(STORAGE_IS_TRACKING, nextState.toString());
  }, [isTracking, steps, duration]);

  const resetActivity = useCallback(async () => {
    // 1. Force tracking to stop first to trigger useEffect cleanup
    setIsTracking(false);
    setStartTime(null);
    
    // 2. Clear all local state
    setSteps(0);
    setBaseSteps(0);
    setCalories(0);
    setDuration(0);
    setIsWalking(false);
    
    // 3. Clear persistent storage
    try {
      await AsyncStorage.multiRemove([
        STORAGE_STEPS, 
        STORAGE_CALORIES, 
        STORAGE_DURATION, 
        STORAGE_IS_TRACKING,
        STORAGE_START_TIME,
        STORAGE_LAST_SYNC_TIME
      ]);
    } catch (e) {
      console.error("Failed to clear activity storage", e);
    }
  }, []);

  return { 
    steps, 
    calories, 
    duration, 
    isWalking, 
    isTracking, 
    toggleTracking, 
    resetActivity, 
    isPedometerAvailable,
    permissionStatus,
    isInPocket,
    lux,
    forcePocket: () => setForcePocket(prev => !prev)
  };
};
