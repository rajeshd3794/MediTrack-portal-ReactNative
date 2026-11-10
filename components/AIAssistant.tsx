import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Modal, Platform, KeyboardAvoidingView, SafeAreaView } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

GUIDELINES:
- Be concise. Identify that you know they are on ${currentPath}.`;
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
  const scrollViewRef = useRef<ScrollView>(null);
  const router = useRouter();
  const pathname = usePathname();

  const handleSend = async (textOverride?: string) => {
    const messageText = textOverride || input;
    if (!messageText.trim()) return;

    const userMsgText = messageText.trim();
    const newUserMessage: Message = { id: Date.now().toString(), text: userMsgText, isUser: true, role: 'user' };

    const updatedMessages = [...messages, newUserMessage];
    setMessages(updatedMessages);
    if (!textOverride) setInput('');
    setIsTyping(true);

    try {
      const currentPath = pathname;
      const loggedInUser = await AsyncStorage.getItem('logged_in_patient');
      const dynamicPrompt = getDynamicSystemPrompt(currentPath, loggedInUser);
      const apiKey = process.env.EXPO_PUBLIC_LLM_API_KEY || "";
      const isGroq = apiKey.startsWith('gsk_');
      const isHF = apiKey.startsWith('hf_');

      let aiAnswer = '';

      if (apiKey && (isGroq || isHF)) {
        const targetUrl = isGroq ? GROQ_API_URL : HF_API_URL;
        const targetModel = isGroq ? 'llama-3.1-8b-instant' : 'google/gemma-2-9b-it';
        const apiMessages = [
          { role: 'system', content: dynamicPrompt },
          ...updatedMessages.filter(m => m.id !== 'initial').map(m => ({ role: m.role, content: m.text }))
        ];

        try {
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

          if (response.ok) {
            const data = await response.json();
            if (data.choices && data.choices.length > 0) {
              aiAnswer = data.choices[0].message.content;
            }
          }
        } catch (apiErr) {
          console.warn('LLM API fetch error, falling back to local engine:', apiErr);
        }
      }

      // Built-in Healthcare & Portal Knowledge Engine
      if (!aiAnswer) {
        const query = userMsgText.toLowerCase();
        if (query.includes('appointment') || query.includes('book') || query.includes('schedule')) {
          aiAnswer = "You can manage and schedule appointments in Appointments [[NAVIGATE: /appointments]] or browse doctors in Doctors List [[NAVIGATE: /Doctors-list]].";
        } else if (query.includes('doctor')) {
          aiAnswer = "You can view our available medical specialists in Doctors List [[NAVIGATE: /Doctors-list]].";
        } else if (query.includes('heart rate') || query.includes('pulse') || query.includes('bpm') || query.includes('measure')) {
          aiAnswer = "You can measure and track your live heart rate using the optical sensor in Patient Hub [[NAVIGATE: /patient/hub]].";
        } else if (query.includes('step') || query.includes('fitness') || query.includes('walk') || query.includes('calorie')) {
          aiAnswer = "You can monitor your live step counts and daily burned calories in Fitness Track [[NAVIGATE: /patient/hub/fitnesstrack]].";
        } else if (query.includes('diet') || query.includes('nutrition') || query.includes('plan') || query.includes('wellness')) {
          aiAnswer = "Your personalized diet charts and wellness guidance are available in Patient Health Status [[NAVIGATE: /patient/hub/pchs]] and Fitness Plan [[NAVIGATE: /patient/hub/fitnessplan]].";
        } else if (query.includes('register') || query.includes('sign up') || query.includes('new account')) {
          aiAnswer = "New patients can register in Patient Sign Up [[NAVIGATE: /Sign-up]], and doctors can register in Doctor Sign Up [[NAVIGATE: /doctor-signup]].";
        } else if (query.includes('doctor login') || query.includes('physician')) {
          aiAnswer = "Doctors can securely log in to access clinical records here: [[NAVIGATE: /doctor-login]].";
        } else if (query.includes('admin') || query.includes('administrator')) {
          aiAnswer = "Authorized administrators can access the admin console here: [[NAVIGATE: /admin-login]].";
        } else if (query.includes('patient login') || query.includes('login') || query.includes('sign in')) {
          aiAnswer = "Patients can sign in to view their health records and appointments here: [[NAVIGATE: /patient-auth]].";
        } else if (query.includes('hub') || query.includes('dashboard')) {
          aiAnswer = "Opening your Patient Hub: [[NAVIGATE: /patient/hub]].";
        } else if (query.includes('hi') || query.includes('hello') || query.includes('hey') || query.includes('help')) {
          aiAnswer = `Hello! I am your Meditrack Assistant. You are currently on ${currentPath}. How can I assist you with your health records, appointments, or navigation today?`;
        } else {
          aiAnswer = `I can help you navigate Meditrack! You can ask me to open your Patient Hub, book appointments, track fitness, measure heart rate, or sign in to your account.`;
        }
      }

      // Process navigation markers in answer
      const navMatch = aiAnswer.match(/\[\[NAVIGATE:\s*([^\]]+)\]\]/);
      if (navMatch) {
        const targetPath = navMatch[1].trim();
        if (targetPath.includes('/patient-records/patient-info')) {
          const session = await AsyncStorage.getItem('logged_in_patient');
          if (!session) {
            setMessages(prev => [...prev, {
              id: Date.now().toString(),
              text: "Please enter both username and password to access the patient records dashboard.",
              isUser: false,
              role: 'assistant'
            }]);
            setIsTyping(false);
            return;
          }
        }
        aiAnswer = aiAnswer.replace(/\[\[NAVIGATE:\s*[^\]]+\]\]/g, '').trim();
        setTimeout(() => {
          router.push(targetPath as any);
        }, 1200);
      }

      if (aiAnswer.includes('[[CLOSE]]')) {
        aiAnswer = aiAnswer.replace('[[CLOSE]]', '').trim();
        setTimeout(() => {
          onClose?.();
          router.back();
        }, 1000);
      }

      setMessages(prev => [...prev, { id: Date.now().toString(), text: aiAnswer, isUser: false, role: 'assistant' }]);
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { id: Date.now().toString(), text: "A network error occurred. Please try again.", isUser: false, role: 'assistant' }]);
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
            <Text style={styles.headerStatus}>{isTyping ? 'Thinking...' : 'Online'}</Text>
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

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          placeholder="Ask a question or request navigation..."
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
  webFloatingContainer: {
    position: 'absolute',
    bottom: 24,
    right: 24,
    zIndex: 9999,
  },
  mobileFloatingContainer: {
    position: 'absolute',
    bottom: 30,
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  fabLabel: {
    color: '#1A365D',
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.5,
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
});
