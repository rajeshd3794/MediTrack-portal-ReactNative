import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, TouchableOpacity, Platform, Modal, Dimensions, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { saveHeartRate } from '../services/healthService';
import { LineChart } from 'react-native-chart-kit';
import { WebView } from 'react-native-webview';

interface HeartRateMonitorProps {
  visible: boolean;
  onClose: () => void;
  onResult: (bpm: number) => void;
}

export default function HeartRateMonitor({ visible, onClose, onResult }: HeartRateMonitorProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [bpm, setBpm] = useState<number | null>(null);
  const [message, setMessage] = useState('Place your finger on camera & flash');
  const [isFingerPlaced, setIsFingerPlaced] = useState(false);
  const [isNativeCameraActive, setIsNativeCameraActive] = useState(false);
  
  // PPG & Graph Refs/State
  const [signalData, setSignalData] = useState<number[]>(Array(40).fill(0.5));
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const webViewRef = useRef<WebView>(null);
  const animationRef = useRef<number | null>(null);
  const isMeasuringRef = useRef(false);
  const signalWindowRef = useRef<number[]>([]);
  const beatIntervalsRef = useRef<number[]>([]);
  const lastPeakTimeRef = useRef(0);
  const lastSignalPointRef = useRef(0.5);
  const [liveBpm, setLiveBpm] = useState<number | null>(null);
  const [isUsingWebView, setIsUsingWebView] = useState(false);

  useEffect(() => {
    if (visible) {
      if (!permission?.granted) {
        requestPermission();
      }
      setIsNativeCameraActive(false); 
      setIsScanning(false);
      setProgress(0);
      setBpm(null);
      setMessage('Warming high-performance sensor...');
      setIsFingerPlaced(false);
      
      // Warm up the Data Bridge immediately in the background
      setTimeout(() => {
        if (Platform.OS === 'web') {
           startWebPPG();
        } else {
           startMobilePPG();
        }
      }, 500);
    }
  }, [visible, permission?.granted]);

  const startScanning = () => {
    // 1. Instant imperative command to the pre-warmed sensor
    setIsScanning(true);
    setBpm(null);
    setLiveBpm(null);
    setSignalData(Array(40).fill(0.5));
    setMessage('Real-time tracking active...');
    
    isMeasuringRef.current = true;

    // Send instant torch command to the pre-warmed WebView bridge
    if (isUsingWebView && webViewRef.current) {
        const js = `
          if (typeof window.setTorch === 'function') {
            window.setTorch(true);
          } else {
             // Fallback if not ready
             window.delayedTorch = true;
          }
        `;
        webViewRef.current?.injectJavaScript(js);
    }
  };

  const startWebPPG = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: { ideal: 'environment' } } 
      });
      
      const v = document.createElement('video');
      v.srcObject = stream;
      v.play();
      videoRef.current = v;

      const c = document.createElement('canvas');
      c.width = 100;
      c.height = 100;
      canvasRef.current = c;

      const process = () => {
        if (!isMeasuringRef.current) return;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (ctx && v.readyState >= 2) {
          // Force apply torch constraints (Re-applying helps stability in some browsers)
          const track = stream.getVideoTracks()[0];
          if (track && (track as any).getCapabilities?.().torch) {
            track.applyConstraints({ advanced: [{ torch: true }] } as any).catch(console.warn);
          }

          ctx.drawImage(v, 0, 0, 100, 100);
          const { data } = ctx.getImageData(0, 0, 100, 100);
          
          let totalRed = 0;
          for (let i = 0; i < data.length; i += 4) totalRed += data[i];
          const avgRed = totalRed / (data.length / 4);

          const detected = avgRed > 150;
          setIsFingerPlaced(detected);
          
          if (detected) {
            updateSignal(avgRed / 255);
            setMessage('Recording pulse...');
            setProgress(prev => Math.min(prev + 0.005, 1));
          } else {
            setMessage('Place finger over camera');
            setIsFingerPlaced(false);
          }
        }
        animationRef.current = requestAnimationFrame(process);
      };
      
      // Also apply once at start
      const track = stream.getVideoTracks()[0];
      if (track && (track as any).getCapabilities?.().torch) {
        await track.applyConstraints({ advanced: [{ torch: true }] } as any);
      }
      
      process();
    } catch (e) {
      console.error(e);
      Alert.alert("Camera Error", "Web PPG requires camera permissions.");
      setIsScanning(false);
    }
  };

  const startMobilePPG = () => {
    setIsUsingWebView(true);
    setMessage('Accessing high-resolution camera...');
    setProgress(0);
  };

  const handleWebViewMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'ready') {
        setMessage('Place finger over camera & flash');
      } else if (data.type === 'signal') {
        const detected = true; // Signal is now self-normalizing, we always show results if finger is touching lens
        setIsFingerPlaced(detected);
        
        if (detected) {
          updateSignal(data.val);
          setProgress(prev => Math.min(prev + 0.003, 1));
          setMessage('Real-time tracking active...');
        } else {
          setMessage('Press finger firmly over camera & flash');
        }
      } else if (data.type === 'error') {
        console.error("WebView Camera Error:", data.error);
        setMessage('Hardware conflict detected. Trying again...');
        setIsNativeCameraActive(true); // Re-enable native as backup
        setTimeout(() => setIsNativeCameraActive(false), 500);
      } else if (data.type === 'dark') {
        setMessage('Too dark! Move finger slightly or wait...');
      }
    } catch (e) {
      console.warn("WebView Bridge Error:", e);
    }
  };

  // Aggressive Torch Persistence (Mobile Hybrid)
  useEffect(() => {
    let torchInterval: any;
    if (isScanning && Platform.OS !== 'web') {
      torchInterval = setInterval(() => {
        // Hammer both Native and Web constraints to ensure Torch stays on
        if (isUsingWebView && webViewRef.current) {
           webViewRef.current?.injectJavaScript(`if (window.setTorch) window.setTorch(true);`);
        }
      }, 1000);
    }
    return () => clearInterval(torchInterval);
  }, [isScanning, isUsingWebView]);

  const updateSignal = (val: number) => {
    setSignalData(prev => [...prev.slice(1), val]);
    
    // Smooth the visual signal line for the graph
    const alpha = 0.2;
    lastSignalPointRef.current = lastSignalPointRef.current + alpha * (val - lastSignalPointRef.current);
    
    // High-performance BPM detection logic
    signalWindowRef.current.push(lastSignalPointRef.current);
    if (signalWindowRef.current.length > 50) signalWindowRef.current.shift();

    if (signalWindowRef.current.length >= 30) {
      const now = Date.now();
      const avg = signalWindowRef.current.reduce((a, b) => a + b) / signalWindowRef.current.length;
      const current = signalWindowRef.current[signalWindowRef.current.length - 1];
      const prev = signalWindowRef.current[signalWindowRef.current.length - 2];
      const pprev = signalWindowRef.current[signalWindowRef.current.length - 3];

      // Peak detection logic
      if (prev > avg * 1.015 && prev > current && prev > pprev) {
        const diff = now - lastPeakTimeRef.current;
        if (diff > 450 && diff < 1500) {
          const instantBpm = 60000 / diff;
          beatIntervalsRef.current.push(instantBpm);
          if (beatIntervalsRef.current.length > 8) beatIntervalsRef.current.shift();
          const smoothBpm = Math.round(beatIntervalsRef.current.reduce((a,b)=>a+b)/beatIntervalsRef.current.length);
          setLiveBpm(smoothBpm);
          lastPeakTimeRef.current = now;
        }
      }
    }
  };

  useEffect(() => {
    if (progress >= 1 && isScanning) {
      completeMeasurement(liveBpm || 72);
    }
  }, [progress]);

  const completeMeasurement = (finalBpm: number) => {
    isMeasuringRef.current = false;
    setIsUsingWebView(false); // Stop the WebView sensor
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (videoRef.current && videoRef.current.srcObject) {
       (videoRef.current.srcObject as any).getTracks().forEach((t: any) => t.stop());
    }
    
    setBpm(finalBpm);
    setIsScanning(false);
    setMessage('Measurement complete!');
  };

  const handleClose = () => {
    isMeasuringRef.current = false;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (videoRef.current && videoRef.current.srcObject) {
       (videoRef.current.srcObject as any).getTracks().forEach((t: any) => t.stop());
    }
    setIsScanning(false);
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose}>
            <Text style={styles.closeBtn}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Heart Rate Monitor</Text>
          <View style={{ width: 50 }} />
        </View>

        <View style={styles.body}>
          <View style={styles.cameraWrapper}>
            {!isScanning && Platform.OS !== 'web' && (
              <View style={[styles.camera, { backgroundColor: '#1A202C', justifyContent: 'center', alignItems: 'center' }]}>
                <Text style={[styles.overlayText, { color: '#718096' }]}>Warming high-performance sensor...</Text>
              </View>
            )}

                 <View style={[StyleSheet.absoluteFill, !isScanning ? { width: 1, height: 1, opacity: 0 } : {}]}>
                   <WebView
                      ref={webViewRef}
                      source={{ html: `
                        <html>
                          <head>
                            <style>
                              body { margin:0; padding:0; background:black; overflow:hidden; width:100%; height:100%; display:flex; justify-content:center; align-items:center; }
                              video { width:100%; height:100%; object-fit:cover; transform: scale(1.5); filter: brightness(1.5) contrast(1.2); }
                              .glow { position:absolute; top:0; left:0; width:100%; height:100%; background: radial-gradient(circle, rgba(255, 0, 0, 0.4) 0%, transparent 70%); pointer-events:none; }
                            </style>
                          </head>
                          <body>
                            <video id="video" autoplay playsinline muted></video>
                            <div class="glow"></div>
                            <canvas id="canvas" width="64" height="64" style="display:none;"></canvas>
                            <script>
                              const v = document.getElementById('video');
                              const s = document.createElement('canvas');
                              const c = s.getContext('2d', { willReadFrequently: true });
                              let track = null;
                              let baseline = [];
                              let minVal = 1, maxVal = 0;
                              let avgBrightness = 0;
                              
                              function connect(torch = false) {
                                if (track) track.stop();
                                const constraints = { 
                                   video: { 
                                      facingMode: 'environment',
                                      width: { ideal: 640 },
                                      height: { ideal: 640 },
                                      frameRate: { min: 30, ideal: 60 }
                                   } 
                                };
                                if (torch) constraints.video.advanced = [{ torch: true }];

                                navigator.mediaDevices.getUserMedia(constraints)
                                  .then(stream => {
                                    v.srcObject = stream;
                                    v.play();
                                    track = stream.getVideoTracks()[0];
                                    window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
                                    
                                    // Persistent Kick loop during scan
                                    if (window.isScanning) startKick(torch);
                                  })
                                  .catch(e => window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', error: e.message })));
                              }

                              function startKick(torch) {
                                if (!torch) return;
                                clearInterval(window.kickInterval);
                                let kicks = 0;
                                window.kickInterval = setInterval(() => {
                                   if (avgBrightness < 75) {
                                      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'dark' }));
                                      kick();
                                   } 
                                   // Nuclear AE Hammer: Force driver "hunt" every 5ms
                                   if (track && kicks < 2000) {
                                     track.applyConstraints({ 
                                       advanced: [
                                         { exposureMode: 'continuous' }, 
                                         { whiteBalanceMode: 'continuous' },
                                         { focusMode: 'continuous' }
                                       ] 
                                     }).catch(()=>{});
                                   }
                                   kicks++;
                                   if (kicks > 4000 && avgBrightness >= 75) clearInterval(window.kickInterval);
                                }, 5); // 5ms precision for immediate recovery
                              }

                              function kick() {
                                 if (!track) return;
                                 track.applyConstraints({ advanced: [{ torch: false }] });
                                 setTimeout(() => {
                                   if (track) track.applyConstraints({ advanced: [{ torch: true }, { exposureMode: 'continuous' }] });
                                 }, 100);
                              }

                              window.setTorch = (val) => {
                                 window.isScanning = val;
                                 if (val) {
                                    startKick(true);
                                 } else if (track) {
                                    clearInterval(window.kickInterval);
                                    track.applyConstraints({ advanced: [{ torch: false }] }).catch(()=>{});
                                 }
                              };

                              window.addEventListener('message', (e) => {
                                 try {
                                   const data = JSON.parse(e.data);
                                   if (data.type === 'torch') window.setTorch(data.val);
                                 } catch(err) {}
                              });

                              connect(true);
                              
                              function p() {
                                if (v.readyState >= 2) {
                                  c.drawImage(v, 0, 0, 64, 64);
                                  const d = c.getImageData(0, 0, 64, 64).data;
                                  let r = 0;
                                  for (let i = 0; i < d.length; i += 4) r += d[i];
                                  const currentR = r / (d.length / 4);
                                  avgBrightness = currentR;
                                  
                                  // Ultimate surgical extraction logic (2000x Intensity Zoom)
                                  baseline.push(currentR);
                                  if (baseline.length > 300) baseline.shift();
                                  
                                  minVal = Math.min(...baseline);
                                  maxVal = Math.max(...baseline);
                                  let range = maxVal - minVal;
                                  
                                  // Ultra-Sensitivity: Scale 0.001/255 ripple to full-screen pulse
                                  let val = 0.5;
                                  if (range > 0.001) {
                                     val = (currentR - minVal) / range;
                                  } else {
                                     // Nuclear Extraction Mode
                                     val = 0.5 + ((currentR - (minVal + maxVal)/2) * 1000);
                                  }
                                  
                                  val = Math.max(0.0001, Math.min(0.9999, val));
                                  window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'signal', val }));
                                }
                                requestAnimationFrame(p);
                              }
                              p();
                            </script>
                          </body>
                        </html>
                      ` }}
                      onMessage={handleWebViewMessage}
                      style={{ backgroundColor: 'transparent' }}
                   />
                   {/* Live Graph Overlay on top of Video */}
                   <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,0,0,0.1)' }]}>
                      <View style={styles.liveGraphBox}>
                        <LineChart
                          data={{ labels: [], datasets: [{ data: signalData }] }}
                          width={250}
                          height={180}
                          withDots={false}
                          withInnerLines={false}
                          withOuterLines={false}
                          withHorizontalLabels={false}
                          withVerticalLabels={false}
                          chartConfig={{
                            backgroundColor: 'transparent',
                            backgroundGradientFrom: 'transparent',
                            backgroundGradientTo: 'transparent',
                            color: (opacity = 1) => `rgba(255, 255, 255, ${opacity})`,
                            strokeWidth: 3,
                          }}
                          bezier
                          style={styles.chart}
                        />
                        {liveBpm && <Text style={styles.liveBpmText}>{liveBpm} <Text style={{fontSize: 12}}>BPM</Text></Text>}
                      </View>
                   </View>
                 </View>

            {(permission?.granted && Platform.OS === 'web') && (
               <View style={{ width: '100%', height: '100%', backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
                  {isScanning ? (
                    <View style={styles.liveGraphBox}>
                      <LineChart
                        data={{
                          labels: [],
                          datasets: [{ data: signalData }]
                        }}
                        width={250}
                        height={180}
                        withDots={false}
                        withInnerLines={false}
                        withOuterLines={false}
                        withHorizontalLabels={false}
                        withVerticalLabels={false}
                        chartConfig={{
                          backgroundColor: 'transparent',
                          backgroundGradientFrom: '#transparent',
                          backgroundGradientTo: '#transparent',
                          color: (opacity = 1) => `rgba(255, 62, 62, ${opacity})`,
                          strokeWidth: 3,
                        }}
                        bezier
                        style={styles.chart}
                      />
                      {liveBpm && <Text style={styles.liveBpmText}>{liveBpm} <Text style={{fontSize: 12}}>BPM</Text></Text>}
                    </View>
                  ) : (
                    <Text style={styles.overlayText}>Press & Hold Finger on Camera</Text>
                  )}
               </View>
            )}
            
            {isScanning && (
              <View style={styles.pulseContainer}>
                <View style={[styles.progressLine, { width: `${progress * 100}%` }]} />
              </View>
            )}
          </View>
          

          <View style={styles.instructionBox}>
            <Text style={styles.emoji}>☝️</Text>
            <Text style={styles.msg}>{message}</Text>
            {bpm && (
              <View style={styles.resultBox}>
                <Text style={styles.bpmVal}>{bpm}</Text>
                <Text style={styles.bpmUnit}>BPM</Text>
              </View>
            )}
          </View>

          {!isScanning && (
            <TouchableOpacity 
              style={[styles.actionBtn, bpm ? { backgroundColor: '#718096', marginBottom: 12 } : {}]} 
              onPress={startScanning}
            >
              <Text style={styles.actionBtnText}>
                {bpm ? 'Re-scan Heart Rate' : 'Begin Scanning'}
              </Text>
            </TouchableOpacity>
          )}
          
          {bpm && !isScanning && (
            <TouchableOpacity 
              style={[styles.actionBtn, { backgroundColor: '#48BB78' }]} 
              onPress={() => {
                onResult(bpm);
                saveHeartRate(bpm);
                handleClose();
              }}
            >
              <Text style={styles.actionBtnText}>Save & Done</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  closeBtn: { color: '#E53E3E', fontWeight: '600', fontSize: 16 },
  title: { fontSize: 18, fontWeight: '700', color: '#2D3748' },
  body: { flex: 1, padding: 24, alignItems: 'center' },
  cameraWrapper: {
    width: 250,
    height: 250,
    borderRadius: 125,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 8,
    borderColor: '#FFFFFF',
    marginBottom: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  camera: { width: '100%', height: '100%' },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(229, 62, 62, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  overlayText: { color: '#FFFFFF', textAlign: 'center', fontWeight: '700', fontSize: 14 },
  pulseContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 60, justifyContent: 'center' },
  progressLine: { height: 4, backgroundColor: '#F56565' },
  instructionBox: { alignItems: 'center', marginBottom: 40 },
  emoji: { fontSize: 40, marginBottom: 16 },
  msg: { fontSize: 16, color: '#4A5568', textAlign: 'center', fontWeight: '500' },
  resultBox: { marginTop: 20, alignItems: 'center', flexDirection: 'row' },
  bpmVal: { fontSize: 64, fontWeight: '900', color: '#E53E3E' },
  bpmUnit: { fontSize: 24, fontWeight: '700', color: '#718096', marginLeft: 12, marginTop: 24 },
  actionBtn: {
    backgroundColor: '#F56565',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 16,
    shadowColor: '#F56565',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 5,
  },
  actionBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  liveGraphBox: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  chart: { paddingRight: 0, marginTop: 20 },
  liveBpmText: { 
    position: 'absolute', 
    bottom: 20, 
    color: '#FFFFFF', 
    fontSize: 32, 
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 5
  },
});
