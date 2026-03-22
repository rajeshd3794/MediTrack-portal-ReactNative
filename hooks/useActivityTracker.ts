import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_STEPS = 'activity_steps';
const STORAGE_CALORIES = 'activity_calories';
const STORAGE_DURATION = 'activity_duration';
const STORAGE_IS_TRACKING = 'activity_is_tracking';

const STORAGE_START_TIME = 'activity_start_time';

export const useActivityTracker = () => {
  const [steps, setSteps] = useState(0);
  const [calories, setCalories] = useState(0);
  const [duration, setDuration] = useState(0); 
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isPedometerAvailable, setIsPedometerAvailable] = useState('checking');
  const [permissionStatus, setPermissionStatus] = useState<string>('undetermined');
  const [isWalking, setIsWalking] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  
  // Track steps taken BEFORE the current start command
  const [baseSteps, setBaseSteps] = useState(0);

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
        
        if (savedSteps) {
          const s = parseInt(savedSteps, 10);
          setSteps(s);
          setBaseSteps(s);
          setCalories(Math.round(s * 0.04));
        }
        if (savedDuration) {
          setDuration(parseInt(savedDuration, 10));
        }
        if (savedTracking === 'true') {
          setIsTracking(true);
          if (savedStartTime) {
            setStartTime(parseInt(savedStartTime, 10));
          }
        }
      } catch (e) {
        console.error("Failed to load activity stats", e);
      }
    };
    loadStats();
  }, []);

  // Set up Pedometer
  useEffect(() => {
    let subscription: any;

    if (!isTracking) return;

    const subscribe = async () => {
      // Re-verify availability and check permission
      const isAvailable = await Pedometer.isAvailableAsync();
      if (!isAvailable) return;

      // watchStepCount returns steps SINCE the listener started
      subscription = Pedometer.watchStepCount(result => {
        // total = steps_before_start + steps_in_this_session
        const newTotalSteps = baseSteps + result.steps;
        const newCals = Math.round(newTotalSteps * 0.04);
        
        setSteps(newTotalSteps);
        setCalories(newCals);
        setIsWalking(true);
        
        // Persist
        AsyncStorage.setItem(STORAGE_STEPS, newTotalSteps.toString());
        AsyncStorage.setItem(STORAGE_CALORIES, newCals.toString());
      });
    };

    subscribe();
    return () => {
      if (subscription) subscription.remove();
    };
  }, [isTracking, baseSteps]);

  // Duration Timer logic (Resilient to background/lock)
  useEffect(() => {
    let interval: any;
    if (isTracking && startTime) {
      interval = setInterval(() => {
        const now = Date.now();
        const newDuration = Math.floor((now - startTime) / 1000);
        setDuration(newDuration);
        AsyncStorage.setItem(STORAGE_DURATION, newDuration.toString());
      }, 1000);

      const timeout = setTimeout(() => {
        setIsWalking(false);
      }, 3000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [isTracking, startTime, isWalking]);

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
        STORAGE_START_TIME
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
    permissionStatus
  };
};
