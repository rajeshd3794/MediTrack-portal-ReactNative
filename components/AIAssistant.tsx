import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Modal, Platform, KeyboardAvoidingView, Animated, Keyboard, SafeAreaView } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { Audio } from 'expo-av';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialIcons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

const getDynamicSystemPrompt = (currentPath: string, username: string | null) => {
  return `You are the official Meditrack AI Assistant. Provide 100% accurate guidance for the Meditrack portal.

CURRENT CONTEXT:
- Current Page: ${currentPath}
- Logged-in User: ${username || 'Guest (Not Logged In)'}
- System Time: ${new Date().toLocaleString()}

STRICT NAVIGATION MAPPINGS:
- Patient Dashboard: [[NAVIGATE: /patient-records/patient-info]]
- Registration Section: [[NAVIGATE: /Sign-up]]
- Patient Authentication: [[NAVIGATE: /patient-auth]]
- Doctor Login: [[NAVIGATE: /doctor-login]]
- Doctor Registration: [[NAVIGATE: /doctor-signup]]
- Admin Access: [[NAVIGATE: /admin-login]]
- Fitness Tracking: [[NAVIGATE: /patient/hub/fitnesstrack]]
- Wellness/Nutrition Plans: [[NAVIGATE: /patient/hub/pchs]]
- Main Landing Page: [[NAVIGATE: /]]
- Close/Go Back: [[CLOSE]]

INTERACTION GUIDANCE:
1. Clicking: Guide users to "Click" or "Tap" buttons by label.
2. Data Entry: Instruct users to "Tap the text field" to enter or edit information.
3. Closing: Use [[CLOSE]] marker to close pages or go back.

AUTHENTICATION & SECURITY:
- PROHIBITED from using [[NAVIGATE: /patient-records/patient-info]] unless user has manually logged in (context user is not 'Guest').
- If user requests login/dashboard while session is 'Guest', reply: "Please enter both username and password."

MULTI-MODAL CONSISTENCY:
- The user can input commands via Voice (Speech-to-Text) or Keyboard (Text). Treat both inputs identically. 
- If a voice command says "Close the main landing page" or "Navigate to dashboard", you MUST provide the EXACT same accurate 100% results (using [[CLOSE]] or [[NAVIGATE: /path]]) as if it were typed.

GUIDELINES:
- Be concise. Identify that you know they are on ${currentPath}.
- Only use markers when explicitly requested.`;
};

const HF_API_URL = "https://router.huggingface.co/hf-inference/models/google/gemma-2-9b-it/v1/chat/completions";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

type Message = { id: string; text: string; isUser: boolean; role: 'user' | 'assistant' };

export const AIAssistantChat = ({ onClose }: { onClose?: () => void }) => {
  const [messages, setMessages] = useState<Message[]>([
    { id: 'initial', text: 'Hi there! I am your Meditrack AI Assistant. How can I help you today?', isUser: false, role: 'assistant' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [showNewOptions, setShowNewOptions] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const silenceTimerRef = useRef<number>(0);
  const hasSpokenRef = useRef<boolean>(false);
  const router = useRouter();
  const pathname = usePathname();

  const startRecording = async () => {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') {
        alert('Microphone permission is required.');
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      // Customized recording options to ensure metering is enabled
      const recordingOptions = {
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        android: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android,
          isMeteringEnabled: true,
        },
        ios: {
          ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios,
          isMeteringEnabled: true,
        },
      };

      const { recording: newRecording } = await Audio.Recording.createAsync(recordingOptions);
      
      silenceTimerRef.current = 0;
      hasSpokenRef.current = false;
      newRecording.setProgressUpdateInterval(200);
      newRecording.setOnRecordingStatusUpdate((status) => {
        if (!status.isRecording) return;
        
        // Metering values are in dBFS (0 to -160)
        const isSilent = status.metering !== undefined && status.metering < -50;
        
        if (!isSilent) {
          hasSpokenRef.current = true;
          silenceTimerRef.current = 0;
        } else if (hasSpokenRef.current) {
          // Only start silence timer if we have detected speech first
          silenceTimerRef.current += 200;
          if (silenceTimerRef.current >= 1000) { // 1.0 seconds of silence for instant voice dictation feel
            stopRecording();
          }
        }
      });

      setRecording(newRecording);
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = async () => {
    setIsRecording(false); // SET IMMEDIATELY FOR UI SNAP
    try {
      if (!recording) return;
      
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);
      
      if (!uri) return;
      
      setIsTranscribing(true);
      await transcribeAudio(uri);
    } catch (err) {
      console.error('Failed to stop recording', err);
      setIsTranscribing(false);
    }
  };

  const transcribeAudio = async (uri: string) => {
    try {
      const apiKey = process.env.EXPO_PUBLIC_LLM_API_KEY || "";
      if (!apiKey.startsWith('gsk_')) {
        alert("Whisper Transcription requires a valid Groq key setup in .env");
        setIsTranscribing(false);
        return;
      }

      const formData = new FormData();
      
      if (Platform.OS === 'web') {
        const fetchRes = await fetch(uri);
        const blob = await fetchRes.blob();
        formData.append('file', blob, 'audio.webm');
      } else {
        formData.append('file', {
          uri,
          type: Platform.OS === 'ios' ? 'audio/m4a' : 'audio/m4a',
          name: 'audio.m4a',
        } as any);
      }
      
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('language', 'en'); // Strict English only

      const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}` },
        body: formData,
      });

      const data = await response.json();
      if (data && data.text) {
        // Automatically send the transcribed text
        handleSend(data.text);
      } else {
        console.warn("Transcription failed", data);
      }
    } catch (e) {
      console.error("Transcription error", e);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleSend = async (textOverride?: string) => {
    const messageText = textOverride || input;
    if (!messageText.trim()) return;

    const userMsgText = messageText.trim();
    const newUserMessage: Message = { id: Date.now().toString(), text: userMsgText, isUser: true, role: 'user' };

    // Update local UI state
    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    if (!textOverride) setInput('');
    setIsTyping(true);

    try {
      // Get Real-Time Context
      const currentPath = pathname;
      const loggedInUser = await AsyncStorage.getItem('logged_in_patient');
      const dynamicPrompt = getDynamicSystemPrompt(currentPath, loggedInUser);

      const apiKey = process.env.EXPO_PUBLIC_LLM_API_KEY || "YOUR_GROQ_OR_HF_TOKEN_HERE";

      if (!apiKey || apiKey.includes('your_') || apiKey === "YOUR_GROQ_OR_HF_TOKEN_HERE") {
        setTimeout(() => {
          setMessages(prev => [...prev, { id: Date.now().toString(), text: "Please assign a valid Hugging Face (hf_) or Groq (gsk_) token to EXPO_PUBLIC_LLM_API_KEY in the .env file and clear cache to restart.", isUser: false, role: 'assistant' }]);
          setIsTyping(false);
        }, 500);
        return;
      }

      const isGroq = apiKey.startsWith('gsk_');
      const targetUrl = isGroq ? GROQ_API_URL : HF_API_URL;
      const targetModel = isGroq ? 'llama-3.1-8b-instant' : 'google/gemma-2-9b-it';

      // Format history with Dynamic Prompt
      const apiMessages = [
        { role: 'system', content: dynamicPrompt },
        ...updatedMessages.filter(m => m.id !== 'initial').map(m => ({ role: m.role, content: m.text }))
      ];

      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: targetModel,
          messages: apiMessages,
          temperature: 0.3,
          max_tokens: 500
        })
      });

      const data = await response.json();
      
      if (response.ok && data.choices && data.choices.length > 0) {
        let aiAnswer = data.choices[0].message.content;
        
        // Navigation Logic
        const navMatch = aiAnswer.match(/\[\[NAVIGATE:\s*([^\]]+)\]\]/);
        if (navMatch) {
          const targetPath = navMatch[1].trim();
          
          // Security Guard: Check if user is logged in before allowing dashboard navigation
          if (targetPath.includes('/patient-records/patient-info')) {
            const session = await AsyncStorage.getItem('logged_in_patient');
            if (!session) {
              setMessages(prev => [...prev, { 
                id: Date.now().toString(), 
                text: "Please enter both username and password.", 
                isUser: false, 
                role: 'assistant' 
              }]);
              setIsTyping(false);
              return; // Stop processing and block navigation
            }
          }

          // Clean the answer for display
          aiAnswer = aiAnswer.replace(/\[\[NAVIGATE:\s*[^\]]+\]\]/g, '').trim();
          
          // Trigger navigation
          setTimeout(() => {
             // WE REMOVE onClose?.() here to allow user to close manually
             router.push(targetPath as any);
          }, 1500); // Small delay so user sees the text first
        }

        // Close/Back Logic
        if (aiAnswer.includes('[[CLOSE]]')) {
          aiAnswer = aiAnswer.replace('[[CLOSE]]', '').trim();
          setTimeout(() => {
            onClose?.();
            router.back();
          }, 1000);
        }

        setMessages(prev => [...prev, { id: Date.now().toString(), text: aiAnswer, isUser: false, role: 'assistant' }]);
      } else if (response.status === 403) {
        setMessages(prev => [...prev, { id: Date.now().toString(), text: "Token Error: Your Hugging Face token lacks permissions. Please create a new Fine-Grained token and verify that the 'Make calls to the Serverless Inference API' checkbox is CHECKED.", isUser: false, role: 'assistant' }]);
      } else {
        console.warn("LLM API Error:", data);
        setMessages(prev => [...prev, { id: Date.now().toString(), text: "I'm having trouble connecting to my central servers. Please try again later.", isUser: false, role: 'assistant' }]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { id: Date.now().toString(), text: "A network error occurred. Please check your connection.", isUser: false, role: 'assistant' }]);
    } finally {
      setIsTyping(false);
    }
  };

  useEffect(() => {
    if (scrollViewRef.current) {
      setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages, isTyping]);

  return (
    <KeyboardAvoidingView
      style={styles.chatContainer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.chatHeader}>
        <View style={styles.headerInfo}>
          <View>
            <Text style={styles.headerTitle}>Meditrack AI Assistant</Text>
            <Text style={styles.headerStatus}>{isTyping ? 'Typing...' : isTranscribing ? 'Transcribing Audio...' : 'Online'}</Text>
          </View>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>×</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesArea}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      >
        {messages.map(msg => (
          <View key={msg.id} style={[styles.messageBubble, msg.isUser ? styles.userBubble : styles.aiBubble]}>
            <Text style={[styles.messageText, msg.isUser ? styles.userText : styles.aiText]}>{msg.text}</Text>
          </View>
        ))}
        {isTyping && (
          <View style={[styles.messageBubble, styles.aiBubble, { width: 60, paddingVertical: 12 }]}>
            <Text style={styles.aiText}>...</Text>
          </View>
        )}
      </ScrollView>

      {messages.length <= 2 && (
        <View style={styles.quickActionsContainer}>
          <TouchableOpacity style={styles.quickActionBtn} onPress={() => setShowNewOptions(!showNewOptions)} activeOpacity={0.7}>
            <Text style={styles.quickActionBtnText}>New to Meditrack?</Text>
            <Text style={styles.quickActionArrow}>{showNewOptions ? '↑' : '↓'}</Text>
          </TouchableOpacity>
          
          {showNewOptions && (
            <View style={styles.quickActionsDropdown}>
              <Text style={styles.qaTitle}>If you are new to Meditrack:</Text>
              
              <TouchableOpacity style={styles.qaLinkRow} onPress={() => { onClose?.(); router.push('/Sign-up'); }}>
                <Text style={styles.qaLinkText}>Register Now (New Patient Account) : <Text style={styles.qaLinkUnderline}>Click here</Text></Text>
              </TouchableOpacity>
              
              <TouchableOpacity style={styles.qaLinkRow} onPress={() => { onClose?.(); router.push('/doctor-signup'); }}>
                <Text style={styles.qaLinkText}>Register Now (New Doctor Account) : <Text style={styles.qaLinkUnderline}>Click here</Text></Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      <View style={styles.inputContainer}>
        <TouchableOpacity 
          style={styles.micBtnWrapper} 
          onPress={isRecording ? stopRecording : startRecording}
          activeOpacity={0.7}
        >
          <BlurView 
            intensity={Platform.OS === 'android' ? 100 : 80} 
            tint={isRecording ? "dark" : "light"} 
            style={[styles.micBtnGlass, isRecording && { backgroundColor: 'rgba(229, 62, 62, 0.2)' }]}
          >
            {isTranscribing ? (
               <MaterialIcons name="hourglass-empty" size={28} color={isRecording ? "#FFF" : "#A0AEC0"} />
            ) : isRecording ? (
               <MaterialIcons name="keyboard-voice" size={28} color="#FC8181" />
            ) : (
               <MaterialIcons name="keyboard-voice" size={28} color="#3182CE" />
            )}
          </BlurView>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Ask a question..."
          placeholderTextColor="#A0AEC0"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={() => handleSend()}
        />
        <TouchableOpacity style={[styles.sendBtn, input.trim() ? styles.sendBtnActive : {}]} onPress={() => handleSend()}>
          <Text style={styles.sendBtnText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

export const MobileAIAssistantModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
        <AIAssistantChat onClose={onClose} />
      </SafeAreaView>
    </Modal>
  );
};

export const GlobalFloatingAI = () => {
  const [isOpen, setIsOpen] = useState(false);

  const renderFabContent = () => (
    <TouchableOpacity style={styles.fabWrapper} activeOpacity={0.8} onPress={() => setIsOpen(true)}>
      <BlurView intensity={Platform.OS === 'android' ? 100 : 80} tint="light" style={styles.fabGlass}>
        <Text style={styles.fabLabel}>Ask Me</Text>
      </BlurView>
    </TouchableOpacity>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webFloatingContainer}>
        {isOpen ? (
          <View style={styles.webChatWindow}>
            <AIAssistantChat onClose={() => setIsOpen(false)} />
          </View>
        ) : (
          renderFabContent()
        )}
      </View>
    );
  }

  // Mobile App Global Floating Button with Full-Screen Modal
  return (
    <>
      <View style={styles.mobileFloatingContainer}>
        {renderFabContent()}
      </View>
      <MobileAIAssistantModal visible={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
};

const styles = StyleSheet.create({
  chatContainer: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  chatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingTop: Platform.OS === 'android' ? 40 : 16,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerEmoji: {
    fontSize: 28,
    marginRight: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A365D',
  },
  headerStatus: {
    fontSize: 12,
    color: '#48BB78',
    fontWeight: '600',
  },
  closeBtn: {
    padding: 8,
    backgroundColor: '#EDF2F7',
    borderRadius: 20,
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#4A5568',
    lineHeight: 22,
  },
  messagesArea: {
    flex: 1,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 14,
    borderRadius: 18,
    marginBottom: 12,
  },
  userBubble: {
    backgroundColor: '#3182CE',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    backgroundColor: '#EBF8FF',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#BEE3F8',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userText: {
    color: '#FFFFFF',
  },
  aiText: {
    color: '#2D3748',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 12,
    fontSize: 15,
    color: '#2D3748',
    marginRight: 10,
  },
  micBtnWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  micBtnGlass: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(237, 242, 247, 0.4)',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnActive: {
    backgroundColor: '#3182CE',
  },
  sendBtnText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  // Web specific styles
  webFloatingContainer: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    zIndex: 9999,
  },
  mobileFloatingContainer: {
    position: 'absolute',
    bottom: 30, // Usually placed slightly higher to avoid tab bars or home indicators
    right: 20,
    zIndex: 9999,
  },
  fabWrapper: {
    borderRadius: 30,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  fabGlass: {
    paddingVertical: 14,
    paddingHorizontal: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)', // Extra frost layer
  },
  fabLabel: {
    color: '#1A365D', // Dark Blue
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.5,
  },
  fab: {
    display: 'none',
  },
  fabEmoji: {
    fontSize: 26,
  },
  webChatWindow: {
    width: 350,
    height: 500,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickActionsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: '#F7F9FC',
    alignItems: 'center', // Center content
  },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EDF2F7',
    alignSelf: 'center', // Centered alignment
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickActionBtnText: {
    fontSize: 14,
    color: '#2D3748',
    fontWeight: '600',
    marginRight: 6,
  },
  quickActionArrow: {
    fontSize: 12,
    color: '#4A5568',
    fontWeight: '800',
  },
  quickActionsDropdown: {
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  qaTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1A365D',
    marginBottom: 10,
  },
  qaLinkRow: {
    paddingVertical: 6,
  },
  qaLinkText: {
    fontSize: 14,
    color: '#4A5568',
  },
  qaLinkUnderline: {
    color: '#3182CE',
    fontWeight: '600',
    textDecorationLine: 'underline',
  }
});
