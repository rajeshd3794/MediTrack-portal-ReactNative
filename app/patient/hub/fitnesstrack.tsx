import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Platform, Dimensions, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useActivity } from '../../../context/ActivityContext';
import HeartRateMonitor from '../../../components/HeartRateMonitor';

const { width } = Dimensions.get('window');

export default function PatientFitnessTrack() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const { steps, calories, duration, isWalking, isTracking, toggleTracking, resetActivity, permissionStatus, isInPocket, lux, forcePocket } = useActivity();
  
  // Real-time Heart Rate State
  const [isMeasuring, setIsMeasuring] = useState(false);
  const isMeasuringRef = useRef(false);
  const [isFingerPlaced, setIsFingerPlaced] = useState(false);
  const isFingerPlacedRef = useRef(false);
  const [heart_bpm, setHeartBpm] = useState(75);
  const [heartRateHistory, setHeartRateHistory] = useState([65, 72, 68, 85, 92, 78, 70, 68, 75, 82]);
  const [measurementProgress, setMeasurementProgress] = useState(0);
  const measurementProgressRef = useRef(0);
  const [flashSupported, setFlashSupported] = useState(true);
  const [showMonitor, setShowMonitor] = useState(false);
  
  // Web-specific PPG Refs
  const videoRef = useRef<any>(null);
  const canvasRef = useRef<any>(null);
  const animationRef = useRef<number | null>(null);

  const maxHR = 120;

  const [stepPulse, setStepPulse] = useState(false);

  // Sync refs with state
  useEffect(() => { isMeasuringRef.current = isMeasuring; }, [isMeasuring]);
  useEffect(() => { isFingerPlacedRef.current = isFingerPlaced; }, [isFingerPlaced]);
  useEffect(() => { measurementProgressRef.current = measurementProgress; }, [measurementProgress]);

  // Pulse effect when steps increase
  useEffect(() => {
    if (steps > 0) {
      setStepPulse(true);
      const timer = setTimeout(() => setStepPulse(false), 200);
      return () => clearTimeout(timer);
    }
  }, [steps]);

  // Session Cleanup: None (New requirement: Persist on Stop, only reset on Reset button)
  // Removed automatic resetActivity call on unmount to enable session recovery.

  // Handle permission denials
  useEffect(() => {
    if (isTracking && permissionStatus === 'denied') {
      Alert.alert(
        "Permission Required",
        "Motion & Fitness permission is required for accurate step tracking. Please enable it in your device settings.",
        [{ text: "OK" }]
      );
    }
  }, [isTracking, permissionStatus]);

  // PPG Algorithm for Web
  useEffect(() => {
    if (Platform.OS === 'web' && isMeasuring) {
      const startWebPPG = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: { ideal: 'environment' },
              width: { ideal: 640 },
              height: { ideal: 480 }
            } 
          });
          
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
            
            // Wait for tracks and REFS to be ready
            let attempt = 0;
            const checkReady = setInterval(async () => {
              attempt++;
              if (videoRef.current && canvasRef.current) {
                clearInterval(checkReady);
                
                const track = stream.getVideoTracks()[0];
                try {
                  const capabilities = (track as any).getCapabilities?.() || {};
                  if (capabilities.torch) {
                     setFlashSupported(true);
                     await track.applyConstraints({
                       advanced: [{ torch: true }]
                     } as any);
                  } else {
                     setFlashSupported(false);
                  }
                } catch (e) {
                  console.warn("Torch failed:", e);
                  setFlashSupported(false);
                }
                
                processFrames();
              } else if (attempt > 20) {
                clearInterval(checkReady);
                Alert.alert("Camera Error", "Could not initialize PPG sensor. Please refresh.");
                setIsMeasuring(false);
              }
            }, 100);
          }
        } catch (err) {
          console.error("Web Camera Error:", err);
          Alert.alert("Camera Access Error", "Unable to access camera for heart rate. Please check browser permissions.");
          setIsMeasuring(false);
        }
      };

      const processFrames = () => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        let lastBpmUpdate = Date.now();
        
        // Signal Processing State
        let signalWindow: number[] = [];
        const windowSize = 100; // ~3.3 seconds at 30fps
        let lastFingerState = false;
        let lastPeakTime = 0;
        let beatIntervals: number[] = [];

        // Low-pass filter for smoothing
        let lowPassValue = 0;
        const alpha = 0.15; // Smoothness factor

        const loop = () => {
          if (!isMeasuringRef.current) return;
          
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = frame.data;
          
          let totalRed = 0;
          let totalGreen = 0;
          for (let i = 0; i < data.length; i += 4) {
            totalRed += data[i]; 
            totalGreen += data[i+1];
          }
          const pixelCount = data.length / 4;
          const avgRed = totalRed / pixelCount;
          const avgGreen = totalGreen / pixelCount;
          
          // Smart Finger Detection (Lowered threshold for better compatibility)
          const detected = avgRed > 150;
          if (detected !== isFingerPlacedRef.current) {
            setIsFingerPlaced(detected);
            // The ref is synced via useEffect, but we update locally for immediate logic
            isFingerPlacedRef.current = detected; 
            
            if (!detected && measurementProgressRef.current > 0.1) {
              setIsMeasuring(false);
              return;
            }
          }

          if (detected) {
            const rawSignal = (avgRed + avgGreen) / 2;
            lowPassValue = lowPassValue + alpha * (rawSignal - lowPassValue);
            signalWindow.push(lowPassValue);
            if (signalWindow.length > windowSize) signalWindow.shift();

            if (signalWindow.length >= 30) {
              const now = Date.now();
              const minInWindow = Math.min(...signalWindow);
              const maxInWindow = Math.max(...signalWindow);
              const range = maxInWindow - minInWindow;
              const threshold = minInWindow + (range * 0.55);
              
              const current = signalWindow[signalWindow.length - 1];
              const prev = signalWindow[signalWindow.length - 2];
              const prevPrev = signalWindow[signalWindow.length - 3];

              if (prev > threshold && prev > current && prev > prevPrev) {
                const timeSinceLastPeak = now - lastPeakTime;
                if (timeSinceLastPeak > 350 && timeSinceLastPeak < 1500) {
                  const instantBpm = 60000 / timeSinceLastPeak;
                  if (instantBpm > 45 && instantBpm < 180) {
                    beatIntervals.push(instantBpm);
                    if (beatIntervals.length > 5) beatIntervals.shift();
                    const smoothedBpm = Math.round(beatIntervals.reduce((a,b) => a+b, 0) / beatIntervals.length);
                    setHeartBpm(smoothedBpm);
                    lastPeakTime = now;
                    if (now - lastBpmUpdate > 1000) {
                      setHeartRateHistory(prevHistory => [...prevHistory.slice(1), smoothedBpm]);
                      lastBpmUpdate = now;
                    }
                  }
                }
              }
            }
            setMeasurementProgress(prev => Math.min(prev + 0.005, 1));
          } else {
            signalWindow = [];
            beatIntervals = [];
            setMeasurementProgress(0);
          }

          animationRef.current = requestAnimationFrame(loop);
        };

        animationRef.current = requestAnimationFrame(loop);
      };

      startWebPPG();
    }

    return () => {
      setIsFingerPlaced(false);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach((t: any) => {
          if (t.applyConstraints) {
            t.applyConstraints({ advanced: [{ torch: false }] } as any).finally(() => t.stop());
          } else {
            t.stop();
          }
        });
      }
    };
  }, [isMeasuring]);

  // Mobile Implementation Logic (Enhanced Professional Simulation)
  useEffect(() => {
    let interval: any;
    if (Platform.OS !== 'web' && isMeasuring) {
      let mockBpm = 72;
      interval = setInterval(() => {
        if (isFingerPlaced) {
          setMeasurementProgress(prev => {
            if (prev >= 1) {
               // Smooth transitions for mock data
               mockBpm = mockBpm + (Math.random() * 2 - 1);
               const finalBpm = Math.max(60, Math.min(100, Math.round(mockBpm)));
               setHeartBpm(finalBpm);
               setHeartRateHistory(h => [...h.slice(1), finalBpm]);
               return 0;
            }
            return prev + 0.05;
          });
        }
      }, 100);
    }
    return () => {
      clearInterval(interval);
      setIsFingerPlaced(false);
    };
  }, [isMeasuring, isFingerPlaced]);

  const toggleMeasurement = () => {
    setShowMonitor(true);
  };

  const handleMeasurementResult = (finalBpm: number) => {
    setHeartBpm(finalBpm);
    setHeartRateHistory(prev => [...prev.slice(1), finalBpm]);
    setIsFingerPlaced(true);
    setTimeout(() => setIsFingerPlaced(false), 3000); // Pulse indicator for a bit
  };

  const formatDuration = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fitness Track</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <TouchableOpacity 
            style={[styles.startHeaderButton, isTracking && styles.stopHeaderButton]} 
            onPress={toggleTracking}
          >
            <Text style={styles.startHeaderText}>{isTracking ? 'Stop' : 'Start'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={resetActivity}>
            <Text style={{color: '#F56565', fontWeight: '700'}}>Reset</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Status Indicator */}
        {isTracking && (
          <View style={[styles.statusBanner, { backgroundColor: isInPocket ? (isWalking ? '#48BB78' : '#ECC94B') : '#ED8936' }]}>
            <Text style={styles.statusText}>
              {!isInPocket ? '☝️ Place in pocket to track' : (!isWalking ? '👣 Start walking to track' : '✅ Actively Tracking')}
            </Text>
          </View>
        )}

        {/* Activity Summary */}
        <View style={styles.summaryCard}>
          <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16}}>
            <Text style={styles.cardTitle}>Activity Summary</Text>
            {isTracking ? (
              <View style={styles.trackingActiveIndicator}>
                <View style={[styles.activeDot, isWalking && { backgroundColor: '#48BB78', transform: [{ scale: stepPulse ? 1.5 : 1 }] }]} />
                <Text style={styles.activeText}>{isWalking ? 'WALKING...' : 'ACTIVE'}</Text>
              </View>
            ) : (
              <Text style={{fontSize: 12, color: '#A0AEC0', fontWeight: '700'}}>PAUSED</Text>
            )}
          </View>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, stepPulse && { color: '#48BB78', transform: [{ scale: 1.1 }] }]}>
                {steps.toLocaleString()}
              </Text>
              <Text style={styles.summaryLabel}>Steps</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{calories}</Text>
              <Text style={styles.summaryLabel}>Calories</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{formatDuration(duration)}</Text>
              <Text style={styles.summaryLabel}>Duration</Text>
            </View>
          </View>
          {isTracking && (
             <Text style={styles.accuracyHint}>Tip: Keep phone in pocket for best step accuracy</Text>
          )}
        </View>

        {/* Real-time Metrics (Graph) */}
        <Text style={styles.sectionTitle}>Real-time Metrics</Text>
        <View style={styles.graphCard}>
          <View style={styles.graphHeader}>
            <View>
              <Text style={styles.graphTitle}>Heart Rate BPM</Text>
              {isMeasuring && (
                <View style={styles.measuringIndicator}>
                  <View style={[styles.pulseDot, { backgroundColor: isFingerPlaced ? '#F56565' : '#718096', opacity: measurementProgress > 0.5 ? 1 : 0.3 }]} />
                  <Text style={[styles.measuringText, { color: isFingerPlaced ? '#FEB2B2' : '#A0AEC0' }]}>
                    {isFingerPlaced ? 'Algorithm Active...' : 'Waiting for finger...'}
                  </Text>
                </View>
              )}
            </View>

            <Text style={styles.graphValue}>{isFingerPlaced ? heart_bpm : '--'} <Text style={styles.graphUnit}>BPM</Text></Text>
          </View>
          
          <View style={styles.chartContainer}>
            {heartRateHistory.map((val, idx) => (
              <View key={idx} style={styles.barContainer}>
                <View 
                  style={[
                    styles.bar, 
                    { 
                      height: (val / maxHR) * 100,
                      backgroundColor: val > 100 ? '#F56565' : '#4299E1',
                      opacity: isFingerPlaced ? 1 : 0.4
                    }
                  ]} 
                />
              </View>
            ))}
          </View>
          
          {isMeasuring && !isFingerPlaced && (
             <View style={styles.fingerHintOverlay}>
               <Text style={styles.fingerHintText}>👆 Place finger firmly over camera & flash to start</Text>
             </View>
          )}

          <View style={styles.graphFooter}>
            <TouchableOpacity 
              style={[styles.measureButton, isMeasuring && styles.stopButton]} 
              onPress={toggleMeasurement}
            >
              <Text style={styles.measureButtonText}>
                {isMeasuring ? '⏹ Stop Measurement' : '❤️ Start Measure'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* PPG Sensor Interface (Visible when measuring) */}
        {isMeasuring && (
          <View style={styles.sensorContainer}>
            {Platform.OS === 'web' ? (
              <View style={styles.webSensor}>
                <video ref={videoRef} style={{ display: 'none' }} />
                <canvas ref={canvasRef} width="100" height="100" style={styles.miniCanvas} />
                <Text style={[styles.sensorHint, { color: isFingerPlaced ? '#48BB78' : '#FFFFFF' }]}>
                  {isFingerPlaced ? 'Finger Detected ✓' : 'Keep finger steady over camera'}
                </Text>
                {!flashSupported && (
                  <View style={styles.flashWarning}>
                    <Text style={styles.flashWarningText}>⚠️ Browser doesn't support auto-flash.</Text>
                    <Text style={[styles.flashWarningText, { fontSize: 11, marginTop: 2 }]}>Please turn on your flashlight manually for accuracy.</Text>
                  </View>
                )}
              </View>
            ) : (
              <View style={styles.mobileSensor}>
                <CameraView 
                   style={styles.miniCamera} 
                   facing="back"
                   enableTorch={true}
                />
                <TouchableOpacity 
                  activeOpacity={1}
                  style={[styles.sensorOverlay, isFingerPlaced && { backgroundColor: 'rgba(245, 101, 101, 0.3)' }]}
                  onPressIn={() => setIsFingerPlaced(true)}
                  onPressOut={() => {
                    setIsFingerPlaced(false);
                    // Automatic Stop requirement: End measure immediately when finger removed
                    if (measurementProgress > 0) {
                      setIsMeasuring(false);
                    }
                  }}
                >
                   <Text style={[styles.sensorEmoji, { transform: [{ scale: isFingerPlaced ? 1.2 : 1 }] }]}>
                     {isFingerPlaced ? '❤️' : '👆'}
                   </Text>
                   <Text style={styles.sensorHint}>
                     {isFingerPlaced ? 'Hold steady...' : 'Place finger over camera & pulse'}
                   </Text>
                   {isFingerPlaced && (
                     <View style={styles.progressContainer}>
                        <View style={[styles.progressFill, { width: `${measurementProgress * 100}%` }]} />
                     </View>
                   )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* Goals Meter */}
        <Text style={styles.sectionTitle}>Goals Meter</Text>
        <View style={styles.goalsCard}>
          <View style={styles.goalItem}>
            <View style={styles.goalInfo}>
              <Text style={styles.goalName}>Daily Step Target (10,000)</Text>
              <Text style={styles.goalPercent}>{Math.min(Math.round((steps / 10000) * 100), 100)}%</Text>
            </View>
            <View style={styles.meterBase}>
              <View style={[styles.meterFill, { width: `${Math.min((steps / 10000) * 100, 100)}%`, backgroundColor: '#48BB78' }]} />
            </View>
          </View>
          <View style={[styles.goalItem, { marginTop: 16 }]}>
            <View style={styles.goalInfo}>
              <Text style={styles.goalName}>Weekly Workout Goal</Text>
              <Text style={styles.goalPercent}>66%</Text>
            </View>
            <View style={styles.meterBase}>
              <View style={[styles.meterFill, { width: '66%', backgroundColor: '#3182CE' }]} />
            </View>
          </View>
        </View>

        {/* Workout Log */}
        <Text style={styles.sectionTitle}>Workout Log</Text>
        <View style={styles.logCard}>
          <View style={styles.logItem}>
            <View style={styles.logIcon}>
              <Text style={{fontSize: 20}}>🏃</Text>
            </View>
            <View style={styles.logDetails}>
              <Text style={styles.logTitle}>Morning Jog</Text>
              <Text style={styles.logMeta}>Today, 08:30 AM • 30 mins</Text>
            </View>
            <View style={styles.intensityBadge}>
              <Text style={styles.intensityText}>High</Text>
            </View>
          </View>
          <View style={styles.logDivider} />
          <View style={styles.logItem}>
            <View style={styles.logIcon}>
              <Text style={{fontSize: 20}}>🧘</Text>
            </View>
            <View style={styles.logDetails}>
              <Text style={styles.logTitle}>Evening Yoga</Text>
              <Text style={styles.logMeta}>Yesterday, 06:15 PM • 45 mins</Text>
            </View>
            <View style={[styles.intensityBadge, { backgroundColor: '#C6F6D5' }]}>
              <Text style={[styles.intensityText, { color: '#22543D' }]}>Low</Text>
            </View>
          </View>
        </View>

        <View style={styles.navLinks}>
           <TouchableOpacity style={styles.navButton} onPress={() => router.push('/patient/hub/pchs')}>
             <Text style={styles.navButtonText}>Health Status</Text>
           </TouchableOpacity>
           <TouchableOpacity style={styles.navButton} onPress={() => router.push('/patient/hub/fitnessplan')}>
             <Text style={styles.navButtonText}>Fitness Plan</Text>
           </TouchableOpacity>
        </View>

        {/* Simulation Controls for Web */}
        {Platform.OS === 'web' && isTracking && (
          <TouchableOpacity style={styles.simButton} onPress={forcePocket}>
            <Text style={styles.simButtonText}>
              {isInPocket ? '🔓 Exit Pocket (Sim)' : '🛡️ Enter Pocket (Sim)'}
            </Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <HeartRateMonitor 
        visible={showMonitor}
        onClose={() => setShowMonitor(false)}
        onResult={handleMeasurementResult}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
    paddingTop: Platform.OS === 'android' ? 40 : 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A365D',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#EDF2F7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: '#1A365D',
    fontWeight: '700',
  },
  startHeaderButton: {
    backgroundColor: '#48BB78',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  stopHeaderButton: {
    backgroundColor: '#F6E05E',
  },
  startHeaderText: {
    color: '#1A365D',
    fontSize: 14,
    fontWeight: '800',
  },
  trackingActiveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#48BB78',
  },
  activeText: {
    fontSize: 12,
    color: '#48BB78',
    fontWeight: '800',
  },
  content: {
    flex: 1,
    padding: 24,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#2D3748',
    marginBottom: 16,
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#3182CE',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#718096',
    marginTop: 4,
  },
  accuracyHint: {
    fontSize: 10,
    color: '#718096',
    fontStyle: 'italic',
    marginTop: 12,
    textAlign: 'center',
    width: '100%',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A365D',
    marginBottom: 16,
  },
  graphCard: {
    backgroundColor: '#1A365D',
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
  },
  graphHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  graphTitle: {
    fontSize: 14,
    color: '#EBF8FF',
    fontWeight: '600',
  },
  graphValue: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  graphUnit: {
    fontSize: 14,
    color: '#48BB78',
  },
  chartContainer: {
    height: 100,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 20,
  },
  barContainer: {
    width: (width - 120) / 10,
    height: '100%',
    justifyContent: 'flex-end',
  },
  bar: {
    borderRadius: 4,
    width: '100%',
  },
  graphFooter: {
    alignItems: 'center',
  },
  measureButton: {
    backgroundColor: '#48BB78',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    width: '100%',
    alignItems: 'center',
  },
  stopButton: {
    backgroundColor: '#F56565',
  },
  measureButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
  },
  fingerHintOverlay: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    padding: 12,
    marginTop: -10,
    marginBottom: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#4A5568',
    alignItems: 'center',
  },
  fingerHintText: {
    color: '#A0AEC0',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  sensorContainer: {
    marginBottom: 32,
  },
  webSensor: {
    backgroundColor: '#000',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  miniCanvas: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#48BB78',
    marginBottom: 8,
  },
  mobileSensor: {
    height: 140,
    backgroundColor: '#000',
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative',
  },
  miniCamera: {
    width: '100%',
    height: '100%',
    opacity: 0.6,
  },
  sensorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sensorEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  sensorHint: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  flashWarning: {
    marginTop: 12,
    padding: 10,
    backgroundColor: 'rgba(245, 101, 101, 0.2)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F56565',
    width: '100%',
  },
  flashWarningText: {
    color: '#FEB2B2',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
  progressContainer: {
    width: '100%',
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#48BB78',
    borderRadius: 3,
  },
  measuringIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F56565',
    marginRight: 6,
  },
  measuringText: {
    fontSize: 11,
    color: '#FEB2B2',
    fontWeight: '700',
  },
  goalsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  goalItem: {
    width: '100%',
  },
  goalInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  goalName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4A5568',
  },
  goalPercent: {
    fontSize: 14,
    fontWeight: '800',
    color: '#2D3748',
  },
  meterBase: {
    height: 10,
    backgroundColor: '#EDF2F7',
    borderRadius: 5,
    overflow: 'hidden',
  },
  meterFill: {
    height: '100%',
    borderRadius: 5,
  },
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 8,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  logItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  logIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F7FAFC',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  logDetails: {
    flex: 1,
  },
  logTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#2D3748',
  },
  logMeta: {
    fontSize: 12,
    color: '#718096',
    marginTop: 2,
  },
  intensityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#FED7D7',
  },
  intensityText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#822727',
    textTransform: 'uppercase',
  },
  logDivider: {
    height: 1,
    backgroundColor: '#F7FAFC',
    marginHorizontal: 12,
  },
  navLinks: {
    flexDirection: 'row',
    gap: 12,
  },
  navButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3182CE',
  },
  navButtonText: {
    color: '#3182CE',
    fontSize: 14,
    fontWeight: '700',
  },
  statusBanner: {
    padding: 12,
    borderRadius: 12,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statusText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  simButton: {
    backgroundColor: '#EDF2F7',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  simButtonText: {
    color: '#4A5568',
    fontWeight: '700',
  },
});
