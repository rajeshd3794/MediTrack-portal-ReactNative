import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState, AppStateStatus, Alert } from 'react-native';
import { Pedometer, LightSensor } from 'expo-sensors';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';

const FITNESS_KEEP_ALIVE_TASK = 'FITNESS_KEEP_ALIVE_TASK';

// Define the background task that keeps the app alive
TaskManager.defineTask(FITNESS_KEEP_ALIVE_TASK, async ({ data, error }) => {
  if (error) {
    console.error("Background Keep-Alive Task Error:", error);
    return;
  }
});

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
  const [isPocketed, setIsPocketed] = useState(false);
  const isPocketedRef = useRef(false);
  
  // Track steps taken BEFORE the current start command
  const [baseSteps, setBaseSteps] = useState(0);
  const appState = useRef(AppState.currentState);
  const lastSyncTimeRef = useRef<number>(Date.now());
  const lastTickRef = useRef<number>(Date.now());
  const [locationPermission, setLocationPermission] = useState<string>('undetermined');

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
        
        const { status: locStatus } = await Location.getBackgroundPermissionsAsync();
        setLocationPermission(locStatus);

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
        
        // Removed Auto-Resume logic. Tracking always waits for a manual press of the "Start" button.
        setIsTracking(false);
      } catch (e) {
        console.error("Failed to load activity stats", e);
      }
    };
    loadStats();
  }, []);

  // Sync Pocket State to Ref
  useEffect(() => {
    isPocketedRef.current = isPocketed;
  }, [isPocketed]);

  // Pocket Detection (LightSensor)
  useEffect(() => {
    let subscription: any;
    if (isTracking && Platform.OS !== 'web') {
      subscription = LightSensor.addListener(({ illuminance }) => {
        // We still track pocket status for the indicator, but we don't gate the counts anymore.
        setIsPocketed(illuminance < 25);
      });
      LightSensor.setUpdateInterval(1000);
    } else {
      setIsPocketed(false);
    }
    return () => {
      if (subscription) subscription.remove();
    };
  }, [isTracking]);

  // Background/Lock Sync Logic
  const catchUpSteps = async (fromTime: number) => {
    if (Platform.OS === 'web') return;
    const isAvailable = await Pedometer.isAvailableAsync();
    if (!isAvailable) return;

    const now = new Date();
    const start = new Date(fromTime);
    
    try {
      const result = await Pedometer.getStepCountAsync(start, now);
      if (result && result.steps > 0) {
        setSteps(prev => {
          const total = prev + result.steps;
          setCalories(Math.round(total * 0.04));
          AsyncStorage.setItem(STORAGE_STEPS, total.toString()).catch(() => {});
          return total;
        });
      }
      lastSyncTimeRef.current = Date.now();
      AsyncStorage.setItem(STORAGE_LAST_SYNC_TIME, lastSyncTimeRef.current.toString()).catch(() => {});
    } catch (e) {
      // In Airplane mode, sensors may temporarily report errors; we handle this silently.
      console.log("Background step sync skipped (normal if offline/airplane mode):", e);
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

      let lastCumulativeSteps = 0;

      // watchStepCount returns cumulative steps SINCE the listener started
      subscription = Pedometer.watchStepCount(result => {
        const delta = result.steps - lastCumulativeSteps;
        lastCumulativeSteps = result.steps;

        console.log(`Pedometer Event: ${delta} steps. Pocketed: ${isPocketedRef.current}`);

        console.log(`Pedometer Event: ${delta} steps. Pocketed: ${isPocketedRef.current}`);

        // Immediate counting: Now counts as long as tracking is active, regardless of pocket status.
        setSteps(prev => {
          const newTotalSteps = prev + delta;
          const newCals = Math.round(newTotalSteps * 0.04);
          
          setCalories(newCals);
          
          // Local-First Persistence: Fire and forget to avoid blocking hardware loop
          lastSyncTimeRef.current = Date.now();
          AsyncStorage.setItem(STORAGE_STEPS, newTotalSteps.toString()).catch(() => {});
          AsyncStorage.setItem(STORAGE_CALORIES, newCals.toString()).catch(() => {});
          AsyncStorage.setItem(STORAGE_LAST_SYNC_TIME, lastSyncTimeRef.current.toString()).catch(() => {});
          return newTotalSteps;
        });
        setIsWalking(true);
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
    if (isTracking) {
      lastTickRef.current = Date.now();
      
      interval = setInterval(() => {
        const now = Date.now();
        // Calculate delta since last tick to be accurate regardless of interval drift or background suspension
        const delta = Math.floor((now - lastTickRef.current) / 1000);
        
        if (delta >= 1) {
          // Duration increments whenever tracking is active.
          setDuration(prev => {
            const newDuration = prev + delta;
            AsyncStorage.setItem(STORAGE_DURATION, newDuration.toString());
            return newDuration;
          });
          
          // Increment steps simulation for Web/No-Pedometer devices
          if (Platform.OS === 'web' || isPedometerAvailable === 'false') {
            if (isPocketedRef.current || Platform.OS === 'web') {
              setSteps(prev => {
                const nextSteps = prev + Math.floor(Math.random() * (2 * delta + 1)); 
                setCalories(Math.round(nextSteps * 0.04));
                AsyncStorage.setItem(STORAGE_STEPS, nextSteps.toString());
                return nextSteps;
              });
              setIsWalking(true);
            } else {
              setIsWalking(false);
            }
          }
          
          lastTickRef.current = now;
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
  }, [isTracking, isPedometerAvailable]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      // Ensure we stop background updates if the component is destroyed
      Location.stopLocationUpdatesAsync(FITNESS_KEEP_ALIVE_TASK).catch(() => {});
    };
  }, []);

  const toggleTracking = useCallback(async () => {
    const nextState = !isTracking;
    const now = Date.now();
    
    try {
      if (nextState) {
        // 1. Request Motion & Pedometer permissions (if Hardware Available)
        if (Platform.OS !== 'web' && isPedometerAvailable === 'true') {
          try {
            const { granted: pedoGranted, status: pedoStatus } = await Pedometer.requestPermissionsAsync();
            setPermissionStatus(pedoStatus);
            
            if (!pedoGranted) {
               Alert.alert("Permission Required", "Motion and Fitness permission is needed to track your steps accurately. Please enable it in Settings for Meditrack-portal.");
               return;
            }
          } catch (pedoErr: any) {
            console.error("Pedometer permissions request failed:", pedoErr);
            // Fallback: If hardware is actually there but permission failed, we want to know why.
            Alert.alert("Sensor Error", `Unable to access your device's motion sensors: ${pedoErr.message || 'Unknown error'}`);
            return;
          }
        }

        // 2. Request Location permissions (Optional Background Keep-Alive)
        if (Platform.OS !== 'web') {
          try {
            const { status: foreStatus } = await Location.requestForegroundPermissionsAsync();
            if (foreStatus === 'granted') {
                const { status: backStatus } = await Location.requestBackgroundPermissionsAsync();
                setLocationPermission(backStatus);
                
                if (backStatus === 'granted') {
                    // Start the keep-alive task
                    try {
                      await Location.startLocationUpdatesAsync(FITNESS_KEEP_ALIVE_TASK, {
                          accuracy: Location.Accuracy.Lowest,
                          distanceInterval: 100, 
                          showsBackgroundLocationIndicator: true,
                          foregroundService: {
                              notificationTitle: "Fitness Tracking Active",
                              notificationBody: "Tracking your activity in the pocket.",
                              notificationColor: "#48BB78"
                          }
                      });
                    } catch (taskErr) {
                      console.warn("Background task failed to start. Falling back to foreground-only tracking.", taskErr);
                    }
                }
            }
          } catch (locErr) {
            console.warn("Location permission request failed. Background tracking will be unreliable.", locErr);
          }
        }

        // 3. Initialize Timing
        const newStart = now - (duration * 1000);
        setStartTime(newStart);
        lastSyncTimeRef.current = now; 
        
        await AsyncStorage.setItem(STORAGE_START_TIME, newStart.toString());
        await AsyncStorage.setItem(STORAGE_LAST_SYNC_TIME, now.toString());

        setBaseSteps(steps); 
        console.log('Tracking fully initialized. Counting starts immediately.');
      } else {
        // Stopping tracking
        setStartTime(null);
        await AsyncStorage.removeItem(STORAGE_START_TIME);
        
        // Stop keep-alive
        if (Platform.OS !== 'web') {
          Location.stopLocationUpdatesAsync(FITNESS_KEEP_ALIVE_TASK).catch(() => {});
        }
      }

      setIsTracking(nextState);
      await AsyncStorage.setItem(STORAGE_IS_TRACKING, nextState.toString());

    } catch (err: any) {
      console.error("Toggle tracking global error:", err);
      Alert.alert("App Initialisation Error", `Something went wrong while starting the session: ${err.message || 'Unknown error'}`);
    }
  }, [isTracking, steps, duration, isPedometerAvailable]);

  const resetActivity = useCallback(async () => {
    // 1. Force tracking to stop first
    setIsTracking(false);
    setStartTime(null);
    Location.stopLocationUpdatesAsync(FITNESS_KEEP_ALIVE_TASK).catch(() => {});
    
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
    isPocketed,
    toggleTracking, 
    resetActivity, 
    isPedometerAvailable,
    permissionStatus,
    locationPermission
  };
};
