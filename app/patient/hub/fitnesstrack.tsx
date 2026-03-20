import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Platform, Dimensions, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { CameraView, useCameraPermissions } from 'expo-camera';

const { width } = Dimensions.get('window');

export default function PatientFitnessTrack() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  
  // Real-time Heart Rate State
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [bpm, setBpm] = useState(75);
  const [heartRateHistory, setHeartRateHistory] = useState([65, 72, 68, 85, 92, 78, 70, 68, 75, 82]);
  const [measurementProgress, setMeasurementProgress] = useState(0);
  
  // Web-specific PPG Refs
  const videoRef = useRef<any>(null);
  const canvasRef = useRef<any>(null);
  const animationRef = useRef<number | null>(null);

  const maxHR = 120;

  // PPG Algorithm for Web
  useEffect(() => {
    if (Platform.OS === 'web' && isMeasuring) {
      const startWebPPG = async () => {
        try {
          // Use environment (back) camera for PPG as it has the flash
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'environment' } 
          });
          
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
            
            // Attempt to turn on Flash (Torch) on supported browsers (Chrome/Android)
            const track = stream.getVideoTracks()[0];
            const capabilities = (track as any).getCapabilities?.() || {};
            if (capabilities.torch) {
              await track.applyConstraints({
                advanced: [{ torch: true }]
              } as any);
            }
            
            processFrames();
          }
        } catch (err) {
          console.error("Web Camera Error:", err);
          setIsMeasuring(false);
        }
      };

      const processFrames = () => {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        if (!canvas || !video) return;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        let lastBpmUpdate = Date.now();
        let samples: number[] = [];
        let peaks: number[] = [];

        const loop = () => {
          if (!isMeasuring) return;
          
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = frame.data;
          
          let totalRed = 0;
          for (let i = 0; i < data.length; i += 4) {
            totalRed += data[i]; // Sample Red channel
          }
          const avgRed = totalRed / (data.length / 4);
          samples.push(avgRed);
          if (samples.length > 100) samples.shift();

          // Simple Peak Detection
          if (samples.length > 10) {
            const current = samples[samples.length - 1];
            const prev = samples[samples.length - 2];
            const prevPrev = samples[samples.length - 3];
            
            // Detect local maxima above moving average
            const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
            if (prev > avg && prev > current && prev > prevPrev) {
              const now = Date.now();
              if (peaks.length === 0 || now - peaks[peaks.length - 1] > 400) { // Min 400ms between beats
                peaks.push(now);
                if (peaks.length > 5) peaks.shift();
                
                if (peaks.length >= 2) {
                  const intervals = [];
                  for(let i=1; i<peaks.length; i++) {
                    intervals.push(peaks[i] - peaks[i-1]);
                  }
                  const avgInterval = intervals.reduce((a,b) => a+b, 0) / intervals.length;
                  const calculatedBpm = Math.round(60000 / avgInterval);
                  
                  if (calculatedBpm > 40 && calculatedBpm < 180) {
                    setBpm(calculatedBpm);
                    if (now - lastBpmUpdate > 1000) {
                      setHeartRateHistory(prev => [...prev.slice(1), calculatedBpm]);
                      lastBpmUpdate = now;
                    }
                  }
                }
              }
            }
          }

          setMeasurementProgress(prev => Math.min(prev + 0.005, 1));
          animationRef.current = requestAnimationFrame(loop);
        };

        animationRef.current = requestAnimationFrame(loop);
      };

      startWebPPG();
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (videoRef.current && videoRef.current.srcObject) {
        const tracks = videoRef.current.srcObject.getTracks();
        tracks.forEach((t: any) => {
          // Turn off torch if supported before stopping
          if (t.applyConstraints) {
            t.applyConstraints({ advanced: [{ torch: false }] } as any).finally(() => t.stop());
          } else {
            t.stop();
          }
        });
      }
    };
  }, [isMeasuring]);

  // Mobile Simulation Logic (Coupled with Camera active)
  useEffect(() => {
    let interval: any;
    if (Platform.OS !== 'web' && isMeasuring) {
      interval = setInterval(() => {
        setMeasurementProgress(prev => {
          if (prev >= 1) {
             const newBpm = Math.floor(Math.random() * (85 - 68 + 1)) + 68;
             setBpm(newBpm);
             setHeartRateHistory(h => [...h.slice(1), newBpm]);
             return 0;
          }
          return prev + 0.05;
        });
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isMeasuring]);

  const toggleMeasurement = async () => {
    if (!isMeasuring) {
      if (Platform.OS !== 'web' && !permission?.granted) {
        const res = await requestPermission();
        if (!res.granted) {
          Alert.alert("Permission Required", "Camera access is needed for heart rate measurement.");
          return;
        }
      }
      setIsMeasuring(true);
      setMeasurementProgress(0);
    } else {
      setIsMeasuring(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fitness Track</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Activity Summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.cardTitle}>Activity Summary</Text>
          <View style={styles.summaryGrid}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>8,432</Text>
              <Text style={styles.summaryLabel}>Steps</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>450</Text>
              <Text style={styles.summaryLabel}>Calories</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>45m</Text>
              <Text style={styles.summaryLabel}>Duration</Text>
            </View>
          </View>
        </View>

        {/* Real-time Metrics (Graph) */}
        <Text style={styles.sectionTitle}>Real-time Metrics</Text>
        <View style={styles.graphCard}>
          <View style={styles.graphHeader}>
            <View>
              <Text style={styles.graphTitle}>Live Heart Rate</Text>
              {isMeasuring && (
                <View style={styles.measuringIndicator}>
                  <View style={[styles.pulseDot, { opacity: measurementProgress > 0.5 ? 1 : 0.3 }]} />
                  <Text style={styles.measuringText}>Measuring...</Text>
                </View>
              )}
            </View>
            <Text style={styles.graphValue}>{bpm} <Text style={styles.graphUnit}>BPM</Text></Text>
          </View>
          
          <View style={styles.chartContainer}>
            {heartRateHistory.map((val, idx) => (
              <View key={idx} style={styles.barContainer}>
                <View 
                  style={[
                    styles.bar, 
                    { 
                      height: (val / maxHR) * 100,
                      backgroundColor: val > 100 ? '#F56565' : '#4299E1'
                    }
                  ]} 
                />
              </View>
            ))}
          </View>

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
                <Text style={styles.sensorHint}>Keep your face steady in the light</Text>
              </View>
            ) : (
              <View style={styles.mobileSensor}>
                <CameraView 
                   style={styles.miniCamera} 
                   facing="back"
                   enableTorch={true}
                />
                <View style={styles.sensorOverlay}>
                   <Text style={styles.sensorEmoji}>👆</Text>
                   <Text style={styles.sensorHint}>Place finger firmly over camera & flash</Text>
                   <View style={styles.progressContainer}>
                      <View style={[styles.progressFill, { width: `${measurementProgress * 100}%` }]} />
                   </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Goals Meter */}
        <Text style={styles.sectionTitle}>Goals Meter</Text>
        <View style={styles.goalsCard}>
          <View style={styles.goalItem}>
            <View style={styles.goalInfo}>
              <Text style={styles.goalName}>Daily Step Target</Text>
              <Text style={styles.goalPercent}>84%</Text>
            </View>
            <View style={styles.meterBase}>
              <View style={[styles.meterFill, { width: '84%', backgroundColor: '#48BB78' }]} />
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

        <View style={{ height: 40 }} />
      </ScrollView>
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
    fontSize: 20,
    fontWeight: '900',
    color: '#3182CE',
  },
  summaryLabel: {
    fontSize: 12,
    color: '#718096',
    marginTop: 4,
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
});
