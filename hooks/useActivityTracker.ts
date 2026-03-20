import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import { Pedometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_STEPS = 'activity_steps';
const STORAGE_CALORIES = 'activity_calories';
const STORAGE_DURATION = 'activity_duration';
const STORAGE_IS_TRACKING = 'activity_is_tracking';

export const useActivityTracker = () => {
  const [steps, setSteps] = useState(0);
  const [calories, setCalories] = useState(0);
  const [duration, setDuration] = useState(0); // in seconds
  const [isPedometerAvailable, setIsPedometerAvailable] = useState('checking');
  const [isWalking, setIsWalking] = useState(false);
  const [isTracking, setIsTracking] = useState(false);

  // Load initial data
  useEffect(() => {
    const loadStats = async () => {
      try {
        const savedSteps = await AsyncStorage.getItem(STORAGE_STEPS);
        const savedDuration = await AsyncStorage.getItem(STORAGE_DURATION);
        const savedTracking = await AsyncStorage.getItem(STORAGE_IS_TRACKING);
        
        if (savedSteps) {
          const s = parseInt(savedSteps, 10);
          setSteps(s);
          setCalories(Math.round(s * 0.04));
        }
        if (savedDuration) {
          setDuration(parseInt(savedDuration, 10));
        }
        if (savedTracking === 'true') {
          setIsTracking(true);
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
      const isAvailable = await Pedometer.isAvailableAsync();
      setIsPedometerAvailable(String(isAvailable));

      if (isAvailable) {
        subscription = Pedometer.watchStepCount(result => {
          setSteps(prevSteps => {
            const newSteps = prevSteps + result.steps;
            const newCals = Math.round(newSteps * 0.04);
            setCalories(newCals);
            setIsWalking(true);
            
            // Sync to storage
            AsyncStorage.setItem(STORAGE_STEPS, newSteps.toString());
            AsyncStorage.setItem(STORAGE_CALORIES, newCals.toString());
            
            return newSteps;
          });
        });
      }
    };

    subscribe();
    return () => subscription && subscription.remove();
  }, [isTracking]);

  // Duration Timer logic (only if tracking)
  useEffect(() => {
    let interval: any;
    if (isTracking) {
      interval = setInterval(() => {
        // Only increment duration if we are actually tracking
        setDuration(prev => {
          const next = prev + 1;
          AsyncStorage.setItem(STORAGE_DURATION, next.toString());
          return next;
        });
      }, 1000);

      // Web Simulation / Pedometer Fallback: If no real sensor, we can't detect walking easily
      // So we just maintain the isWalking state if steps changed recently
      const timeout = setTimeout(() => {
        setIsWalking(false);
      }, 3000);

      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [isTracking, isWalking]);

  const toggleTracking = useCallback(async () => {
    const nextState = !isTracking;
    setIsTracking(nextState);
    await AsyncStorage.setItem(STORAGE_IS_TRACKING, nextState.toString());
  }, [isTracking]);

  const resetActivity = useCallback(async () => {
    setSteps(0);
    setCalories(0);
    setDuration(0);
    setIsWalking(false);
    setIsTracking(false);
    await AsyncStorage.multiRemove([STORAGE_STEPS, STORAGE_CALORIES, STORAGE_DURATION, STORAGE_IS_TRACKING]);
  }, []);

  return { steps, calories, duration, isWalking, isTracking, toggleTracking, resetActivity, isPedometerAvailable };
};
