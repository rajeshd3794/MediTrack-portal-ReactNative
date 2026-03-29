import { useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { Pedometer, LightSensor, Accelerometer } from 'expo-sensors';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_STEPS = 'activity_steps';
const STORAGE_CALORIES = 'activity_calories';
const STORAGE_DURATION = 'activity_duration';
const STORAGE_IS_TRACKING = 'activity_is_tracking';
const STORAGE_START_TIME = 'activity_start_time';
const STORAGE_LAST_SYNC_TIME = 'activity_last_sync_time';
const STORAGE_HAS_ENTERED = 'activity_has_entered';

export const useActivityTracker = () => {
  const [steps, setSteps] = useState(0);
  const [calories, setCalories] = useState(0);
  const [duration, setDuration] = useState(0); 
  const [startTime, setStartTime] = useState<number | null>(null);
  const [isPedometerAvailable, setIsPedometerAvailable] = useState('checking');
  const [permissionStatus, setPermissionStatus] = useState<string>('undetermined');
  const [isWalking, setIsWalking] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [lux, setLux] = useState(100); 
  const [isLightSensorAvailable, setIsLightSensorAvailable] = useState<boolean | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [motionMagnitude, setMotionMagnitude] = useState(1.0);
  const [isVertical, setIsVertical] = useState(false);
  const [isJittering, setIsJittering] = useState(false);
  const [debugMode, setDebugMode] = useState(false);
  const [isArmed, setIsArmed] = useState(false);
  const toggleArm = () => setIsArmed(prev => !prev);
  
  // Track steps taken BEFORE the current start command
  const [baseSteps, setBaseSteps] = useState(0);
  const appState = useRef(AppState.currentState);
  const lastSyncTimeRef = useRef<number>(Date.now());
  const lastStepTimeRef = useRef<number>(0);
  const previousSessionStepsRef = useRef<number>(0);

  const [hasEnteredPocket, setHasEnteredPocket] = useState(false);
  const hasEnteredPocketRef = useRef(false);

  const isInPocketRef = useRef(false);
  const isWalkingRef = useRef(false);
  const isMovingRef = useRef(false);

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
        const savedHasEntered = await AsyncStorage.getItem(STORAGE_HAS_ENTERED);
        
        if (savedHasEntered === 'true') {
          setHasEnteredPocket(true);
          hasEnteredPocketRef.current = true;
        }

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
      setIsLightSensorAvailable(isAvailable);
      if (!isAvailable) return;
      subscription = LightSensor.addListener(data => {
        setLux(data.illuminance);
      });
      LightSensor.setUpdateInterval(1000);
    };
    subscribe();
    return () => subscription?.remove();
  }, []);

  // Pocket Logic: 
  // 1. Android/LightSensor: < 60 lux (Relaxed for thin pockets)
  // 2. iOS/No-Sensor: Vertical Tilt > 0.4 (Relaxed for baggy pockets)
  const isPhysicallyInPocket = isLightSensorAvailable ? (lux < 60) : isVertical;
  const isInPocket = isArmed && isPhysicallyInPocket;

  // Sync refs that are used in intervals and listeners
  useEffect(() => { 
    isInPocketRef.current = isInPocket; 
    if (isTracking && isInPocket && !hasEnteredPocketRef.current) {
      setHasEnteredPocket(true);
      hasEnteredPocketRef.current = true;
      AsyncStorage.setItem(STORAGE_HAS_ENTERED, 'true');
    }
  }, [isInPocket, isTracking]);

  useEffect(() => { isWalkingRef.current = isWalking; }, [isWalking]);
  useEffect(() => { isMovingRef.current = isMoving; }, [isMoving]);

  // Accelerometer Logic (Motion Sensitivity)
  useEffect(() => {
    let subscription: any;
    const subscribe = async () => {
      const isAvailable = await Accelerometer.isAvailableAsync();
      if (!isAvailable) return;
      subscription = Accelerometer.addListener(data => {
        const magnitude = Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2);
        setMotionMagnitude(magnitude);
        
        // Orientation detection: Relaxed to 0.4 for broader pocket compatibility
        const tilt = Math.abs(data.y);
        setIsVertical(tilt > 0.4);

        // Movement detection: 1.15+ indicates meaningful movement
        if (!isJittering && (magnitude > 1.15 || magnitude < 0.85)) {
          setIsMoving(true);
        } else {
          setIsMoving(false);
        }
      });
      Accelerometer.setUpdateInterval(500);
    };
    subscribe();
    return () => subscription?.remove();
  }, []);

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
    let isCancelled = false;

    if (!isTracking) return;

    const subscribe = async () => {
      // Re-verify availability and check permission
      const isAvailable = await Pedometer.isAvailableAsync();
      if (!isAvailable || isCancelled) return;

      // watchStepCount returns steps SINCE the listener started
      previousSessionStepsRef.current = 0;
      subscription = Pedometer.watchStepCount(result => {
        const delta = result.steps - previousSessionStepsRef.current;
        previousSessionStepsRef.current = result.steps;

        // Gated Logic: Only count steps if in pocket
        if (!isInPocketRef.current) {
          setIsWalking(false);
          return;
        }
        
        setSteps(prevSteps => {
          const newTotalSteps = prevSteps + delta;
          const newCals = Math.round(newTotalSteps * 0.04);
          
          setCalories(newCals);
          setIsWalking(true);
          lastStepTimeRef.current = Date.now();
          
          // Persist
          lastSyncTimeRef.current = Date.now();
          AsyncStorage.setItem(STORAGE_STEPS, newTotalSteps.toString());
          AsyncStorage.setItem(STORAGE_CALORIES, newCals.toString());
          AsyncStorage.setItem(STORAGE_LAST_SYNC_TIME, lastSyncTimeRef.current.toString());
          
          return newTotalSteps;
        });
      });
    };

    subscribe();
    return () => {
      isCancelled = true;
      if (subscription) subscription.remove();
    };
  }, [isTracking]);

  // Duration & Simulation logic (Resilient to background/lock)
  useEffect(() => {
    let interval: any;
    if (isTracking && startTime) {
      interval = setInterval(() => {
        const now = Date.now();
        const newDuration = Math.floor((now - startTime) / 1000);
        
        // Gated Logic: Increment duration if in pocket, OR if it has not entered the pocket yet.
        // This makes duration start immediately, but pause when taken out.
        if (isInPocketRef.current || !hasEnteredPocketRef.current) {
           setDuration(prev => {
             const next = prev + 1;
             AsyncStorage.setItem(STORAGE_DURATION, next.toString());
             return next;
           });
        }

        // Watchdog: If no steps in 2.5 seconds, set isWalking to false
        if (isWalkingRef.current && Date.now() - lastStepTimeRef.current > 2500) {
          setIsWalking(false);
        }

        // Web/Simulator fallback for steps
        if (Platform.OS === 'web' || isPedometerAvailable === 'false') {
          // Gated Logic: Only simulate if in pocket state
          if (isInPocketRef.current) {
            setSteps(prev => {
              const nextSteps = prev + Math.floor(Math.random() * 3); // Sim 0-2 steps
              setCalories(Math.round(nextSteps * 0.04));
              AsyncStorage.setItem(STORAGE_STEPS, nextSteps.toString());
              return nextSteps;
            });
            setIsWalking(true);
            lastStepTimeRef.current = Date.now();
          } else {
            setIsWalking(false);
          }
        }
      }, 1000);

      return () => {
        clearInterval(interval);
      };
    }
  }, [isTracking, startTime, isPedometerAvailable]);

  const toggleTracking = useCallback(async () => {
    const nextState = !isTracking;
    const now = Date.now();
    
    if (nextState) {
      // Starting tracking: Ensure we have permissions
      let granted = false;
      let status = 'undetermined';
      
      try {
        const result = await Pedometer.requestPermissionsAsync();
        granted = result.granted;
        status = result.status;
      } catch (e) {
        console.warn("Permission request failed", e);
      }
      
      setPermissionStatus(status);
      if (!granted && Platform.OS !== 'web') {
        // Fallback: If not granted, we allow UI state to change but it will stay at 0
        // until user fixes permissions.
        setIsTracking(true); // Allow start but stay paused
        return;
      }

      // Absolute timing: set startTime to NOW minus current duration
      const newStart = now - (duration * 1000);
      setStartTime(newStart);
      await AsyncStorage.setItem(STORAGE_START_TIME, newStart.toString());

      // Jitter protection: Ignore motion for first 1.2 seconds after tap
      setIsJittering(true);
      setTimeout(() => setIsJittering(false), 1200);

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
    setHasEnteredPocket(false);
    hasEnteredPocketRef.current = false;
    
    // 3. Clear persistent storage
    try {
      await AsyncStorage.multiRemove([
        STORAGE_STEPS, 
        STORAGE_CALORIES, 
        STORAGE_DURATION, 
        STORAGE_IS_TRACKING,
        STORAGE_START_TIME,
        STORAGE_LAST_SYNC_TIME,
        STORAGE_HAS_ENTERED
      ]);
    } catch (e) {
      console.error("Failed to clear activity storage", e);
    }
  }, []);

  // FOR WEB/SIMULATION: Manually trigger a "Walk" for testing
  const simulateWalk = useCallback((count = 10) => {
    setSteps(prev => {
      const next = prev + count;
      setCalories(Math.round(next * 0.04));
      setIsWalking(true);
      AsyncStorage.setItem(STORAGE_STEPS, next.toString());
      return next;
    });
  }, []);

  return { 
    steps, 
    calories, 
    duration, 
    isWalking, 
    isTracking, 
    toggleTracking, 
    resetActivity, 
    simulateWalk,
    isPedometerAvailable,
    permissionStatus,
    isInPocket,
    isPhysicallyInPocket,
    hasEnteredPocket,
    lux,
    isLightSensorAvailable,
    isMoving,
    motionMagnitude,
    debugMode,
    setDebugMode: () => setDebugMode(prev => !prev),
    isArmed,
    toggleArm
  };
};
