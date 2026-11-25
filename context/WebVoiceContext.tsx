import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';

export interface VoiceFormHandler {
  setField?: (field: string, value: string) => void;
  submit?: () => void;
  clear?: () => void;
  onHamburgerMenuClick?: (mode?: 'open' | 'close' | 'toggle') => void;
  triggerAction?: (actionName: string, payload?: any) => void;
}

interface WebVoiceContextType {
  isListening: boolean;
  isSupported: boolean;
  needsGesture: boolean;
  isPaused: boolean;
  transcript: string;
  feedback: string;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
  speak: (text: string) => void;
  executeCommand: (speechText: string) => Promise<boolean>;
  triggerHamburgerMenu: (mode?: 'open' | 'close' | 'toggle') => boolean;
  registerFormHandler: (pageKey: string, handler: VoiceFormHandler) => void;
  unregisterFormHandler: (pageKey: string) => void;
}

const WebVoiceContext = createContext<WebVoiceContextType | null>(null);

const ROUTE_MAPPINGS: Array<{ route: string; aliases: string[] }> = [
  { route: '/patient/hub/fitnesstrack', aliases: ['patient fitness track', 'fitness track', 'fitness tracker', 'step tracker', 'step tracking', 'pedometer', 'track steps', 'my steps'] },
  { route: '/patient/hub/fitnessplan', aliases: ['patient fitness plan', 'fitness plan', 'workout plan', 'diet plan', 'nutrition plan', 'my diet'] },
  { route: '/patient/hub/pchs', aliases: ['patient current health status', 'patient health status', 'current health status', 'health status', 'pchs', 'health metrics'] },
  { route: '/patient/hub', aliases: ['patient hub', 'wellness hub', 'patient dashboard', 'my hub', 'hub'] },
  { route: '/patient-records/patient-info', aliases: ['patient records', 'patient info', 'patient profile', 'my records'] },
  { route: '/patient-history', aliases: ['patient history', 'medical history', 'health history', 'history'] },
  { route: '/appointments-list', aliases: ['appointments list', 'view appointments', 'my appointments', 'all appointments', 'appointment records'] },
  { route: '/appointments', aliases: ['book appointment', 'schedule appointment', 'appointment calendar', 'appointments', 'schedule'] },
  { route: '/Doctors-list', aliases: ['doctors list', 'doctor list', 'find doctor', 'view doctors', 'available doctors', 'doctors', 'specialists'] },
  { route: '/doctor-signup', aliases: ['doctor sign up', 'doctor signup', 'doctor register', 'doctor registration', 'register doctor'] },
  { route: '/doctor-login', aliases: ['doctor login', 'doctor sign in', 'doctor auth', 'login as doctor', 'doctors login'] },
  { route: '/Sign-up', aliases: ['patient sign up', 'patient signup', 'patient register', 'patient registration', 'register patient', 'sign up', 'signup', 'registration'] },
  { route: '/patient-auth', aliases: ['patient login', 'patient sign in', 'login as patient', 'patient portal login', 'patient portal', 'patient auth'] },
  { route: '/admin-login', aliases: ['admin login', 'administrator login', 'admin sign in', 'login as admin', 'admin auth'] },
  { route: '/admin', aliases: ['admin panel', 'admin dashboard', 'admin console', 'administration'] },
  { route: '/dashboard', aliases: ['doctor dashboard', 'dashboard'] },
  { route: '/fetch-username', aliases: ['forgot username', 'fetch username', 'recover username', 'find username'] },
  { route: '/fetch-password', aliases: ['fetch password', 'recover password', 'reset password'] },
  { route: '/forgot-password', aliases: ['forgot password', 'account recovery'] },
  { route: '/', aliases: ['home page', 'main page', 'landing page', 'home', 'welcome', 'landing'] },
];

const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .replace(/[.,!?;:"'()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const setDomInputValue = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
};

const tryFillDomInput = (fieldKeywords: string[], value: string): boolean => {
  if (typeof document === 'undefined') return false;
  const inputs = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')).filter(
    (el) => el.offsetParent !== null && !el.disabled && el.type !== 'hidden'
  );
  for (const input of inputs) {
    const meta = [
      input.placeholder,
      input.getAttribute('aria-label'),
      input.name,
      input.id,
      input.type,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (fieldKeywords.some((kw) => meta.includes(kw))) {
      input.focus();
      setDomInputValue(input, value);
      return true;
    }
  }
  return false;
};

const tryClickHamburgerDom = (): boolean => {
  if (typeof document === 'undefined') return false;
  const el = document.querySelector<HTMLElement>(
    '[data-testid="hamburger-menu"], [aria-label*="hamburger" i], button[aria-label*="menu" i], [role="button"][aria-label*="menu" i]'
  );
  if (el && el.offsetParent !== null) {
    el.click();
    return true;
  }
  return false;
};

const tryClickDomElement = (targetText: string): boolean => {
  if (typeof document === 'undefined') return false;
  const needle = normalizeText(targetText);
  if (!needle) return false;
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>('button, a, [role="button"], [tabindex="0"]')
  ).filter((el) => el.offsetParent !== null);

  // Prefer exact text match, then shortest contains match
  let bestMatch: HTMLElement | null = null;
  let bestLen = Infinity;
  for (const el of candidates) {
    const text = normalizeText(el.innerText || el.textContent || el.getAttribute('aria-label') || '');
    if (!text) continue;
    if (text === needle) {
      el.click();
      return true;
    }
    if (text.includes(needle) && text.length < bestLen) {
      bestMatch = el;
      bestLen = text.length;
    }
  }
  if (bestMatch) {
    bestMatch.click();
    return true;
  }
  return false;
};

export const WebVoiceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const router = useRouter();
  const pathname = usePathname();
  const isWeb = Platform.OS === 'web' && typeof window !== 'undefined';

  const [isSupported, setIsSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [feedback, setFeedback] = useState('');

  const recognitionRef = useRef<any>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  const shouldListenRef = useRef<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const isSpeakingRef = useRef<boolean>(false);
  const ignoreRecognitionUntilRef = useRef<number>(0);
  const lastSpokenRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });
  const speakSafetyTimerRef = useRef<any>(null);
  const activeUtteranceRef = useRef<any>(null);
  const restartTimerRef = useRef<any>(null);
  const feedbackTimerRef = useRef<any>(null);
  const lastExecutedRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });
  const handlersRef = useRef<Map<string, VoiceFormHandler>>(new Map());
  const routerRef = useRef(router);
  const pathnameRef = useRef(pathname);
  const executeCommandRef = useRef<(speechText: string) => Promise<boolean>>(async () => false);
  const resumeRecognitionAfterSpeakRef = useRef<() => void>(() => {});

  useEffect(() => {
    routerRef.current = router;
    pathnameRef.current = pathname;
  }, [router, pathname]);

  const showFeedback = useCallback((msg: string) => {
    setFeedback(msg);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => {
      setFeedback('');
    }, 4500);
  }, []);

  const speak = useCallback((text: string) => {
    if (!isWeb || !('speechSynthesis' in window) || !text.trim()) return;
    const norm = normalizeText(text);
    const now = Date.now();
    // Prevent speaking the same phrase multiple times back-to-back
    if (lastSpokenRef.current.text === norm && now - lastSpokenRef.current.time < 2000) {
      return;
    }
    try {
      // Stop any active SpeechRecognition while TTS is speaking so the mic cannot hear speaker echo
      isSpeakingRef.current = true;
      lastSpokenRef.current = { text: norm, time: now };
      ignoreRecognitionUntilRef.current = now + 8000;

      if (restartTimerRef.current) {
        clearTimeout(restartTimerRef.current);
        restartTimerRef.current = null;
      }
      if (speakSafetyTimerRef.current) {
        clearTimeout(speakSafetyTimerRef.current);
        speakSafetyTimerRef.current = null;
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
        recognitionRef.current = null;
        setIsListening(false);
      }

      const finishSpeaking = () => {
        if (!isSpeakingRef.current) return;
        isSpeakingRef.current = false;
        activeUtteranceRef.current = null;
        if (speakSafetyTimerRef.current) {
          clearTimeout(speakSafetyTimerRef.current);
          speakSafetyTimerRef.current = null;
        }
        // Brief echo-decay window after speaker audio finishes
        ignoreRecognitionUntilRef.current = Date.now() + 600;
        if (shouldListenRef.current && !isPausedRef.current) {
          restartTimerRef.current = setTimeout(() => {
            if (shouldListenRef.current && !isPausedRef.current && !isSpeakingRef.current) {
              resumeRecognitionAfterSpeakRef.current();
            }
          }, 550);
        }
      };

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.onend = finishSpeaking;
      utterance.onerror = finishSpeaking;
      activeUtteranceRef.current = utterance;

      // Safety fallback in case the browser fails to fire utterance.onend
      const fallbackMs = Math.min(Math.max(text.length * 95 + 1200, 2500), 9000);
      speakSafetyTimerRef.current = setTimeout(finishSpeaking, fallbackMs);

      window.speechSynthesis.speak(utterance);
    } catch {
      isSpeakingRef.current = false;
      activeUtteranceRef.current = null;
    }
  }, [isWeb]);

  const registerFormHandler = useCallback((pageKey: string, handler: VoiceFormHandler) => {
    handlersRef.current.set(pageKey, handler);
  }, []);

  const unregisterFormHandler = useCallback((pageKey: string) => {
    handlersRef.current.delete(pageKey);
  }, []);

  const triggerHamburgerMenu = useCallback(
    (mode: 'open' | 'close' | 'toggle' = 'toggle'): boolean => {
      const activeHandler = Array.from(handlersRef.current.values()).pop();
      const label =
        mode === 'open'
          ? 'Opened hamburger menu'
          : mode === 'close'
          ? 'Closed hamburger menu'
          : 'Clicked hamburger menu';

      if (activeHandler?.onHamburgerMenuClick) {
        activeHandler.onHamburgerMenuClick(mode);
        showFeedback(label);
        speak(label);
        return true;
      }

      if (activeHandler?.triggerAction) {
        const actionName = mode === 'open' ? 'OPEN_MENU' : mode === 'close' ? 'CLOSE_MENU' : 'TOGGLE_MENU';
        activeHandler.triggerAction(actionName);
        showFeedback(label);
        speak(label);
        return true;
      }

      if (isWeb && tryClickHamburgerDom()) {
        showFeedback(label);
        speak(label);
        return true;
      }

      return false;
    },
    [isWeb, showFeedback, speak]
  );

  const transcribeAndExecuteMobile = useCallback(
    async (uri: string) => {
      try {
        showFeedback('Processing voice command...');
        const apiKey = process.env.EXPO_PUBLIC_LLM_API_KEY || '';
        if (apiKey.startsWith('gsk_')) {
          const formData = new FormData();
          formData.append('file', {
            uri,
            type: 'audio/m4a',
            name: 'voice_command.m4a',
          } as any);
          formData.append('model', 'whisper-large-v3-turbo');
          formData.append('language', 'en');

          const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${apiKey}` },
            body: formData,
          });
          const data = await response.json();
          if (data?.text) {
            await executeCommandRef.current(data.text);
            return;
          }
        }
        showFeedback('Voice command captured');
      } catch (e) {
        console.warn('Mobile transcription error:', e);
        showFeedback('Could not transcribe audio');
      }
    },
    [showFeedback]
  );

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    isPausedRef.current = true;
    setIsPaused(true);
    setIsListening(false);
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (speakSafetyTimerRef.current) {
      clearTimeout(speakSafetyTimerRef.current);
      speakSafetyTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }
    if (!isWeb && recordingRef.current) {
      const rec = recordingRef.current;
      recordingRef.current = null;
      rec
        .stopAndUnloadAsync()
        .then(() => {
          const uri = rec.getURI();
          if (uri) transcribeAndExecuteMobile(uri);
        })
        .catch(() => {});
      return;
    }
    showFeedback('Voice commands paused');
  }, [isWeb, showFeedback, transcribeAndExecuteMobile]);

  const executeCommand = useCallback(async (rawSpeech: string): Promise<boolean> => {
    if (!rawSpeech || !rawSpeech.trim()) return false;
    const clean = normalizeText(rawSpeech);
    if (!clean) return false;

    const now = Date.now();

    // Drop any residual speaker echo while TTS is speaking or immediately after TTS finishes
    if (isSpeakingRef.current || now < ignoreRecognitionUntilRef.current) {
      return false;
    }
    if (
      lastSpokenRef.current.text &&
      now - lastSpokenRef.current.time < 4000 &&
      (clean === lastSpokenRef.current.text ||
        lastSpokenRef.current.text.includes(clean) ||
        clean.includes(lastSpokenRef.current.text))
    ) {
      return false;
    }

    // Deduplicate identical commands within 2500ms so each spoken command executes strictly once
    if (lastExecutedRef.current.text === clean && now - lastExecutedRef.current.time < 2500) {
      return false;
    }
    lastExecutedRef.current = { text: clean, time: now };
    setTranscript(rawSpeech.trim());

    // 1. Voice meta-controls
    if (clean === 'stop listening' || clean === 'pause voice' || clean === 'mute voice' || clean === 'turn off voice') {
      speak('Voice commands paused.');
      stopListening();
      return true;
    }

    if (clean === 'help' || clean.includes('what can i say') || clean.includes('voice help') || clean.includes('voice commands')) {
      const msg = 'Try saying: Click hamburger menu, Open Patient Hub, Patient Login, Enter username John, Enter password 1234, Submit, Scroll down, or Go back.';
      showFeedback(msg);
      speak(msg);
      return true;
    }

    if (clean === 'refresh' || clean === 'reload' || clean === 'refresh page' || clean === 'reload page') {
      showFeedback('Refreshing page...');
      speak('Refreshing page');
      if (isWeb) window.location.reload();
      return true;
    }

    // 2. Scroll commands (Web)
    if (isWeb) {
      if (clean === 'scroll down' || clean === 'page down') {
        window.scrollBy({ top: 450, behavior: 'smooth' });
        showFeedback('Scrolled down');
        return true;
      }
      if (clean === 'scroll up' || clean === 'page up') {
        window.scrollBy({ top: -450, behavior: 'smooth' });
        showFeedback('Scrolled up');
        return true;
      }
      if (clean === 'scroll to top' || clean === 'go to top') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        showFeedback('Scrolled to top');
        return true;
      }
      if (clean === 'scroll to bottom' || clean === 'go to bottom') {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        showFeedback('Scrolled to bottom');
        return true;
      }
    }

    // 3. Back / Logout
    if (clean === 'go back' || clean === 'back' || clean === 'previous page' || clean === 'return') {
      showFeedback('Going back...');
      speak('Going back');
      routerRef.current.back();
      return true;
    }

    if (clean.includes('log out') || clean.includes('logout') || clean.includes('sign out')) {
      await AsyncStorage.multiRemove(['logged_in_patient', 'logged_in_doctor', 'logged_in_admin', 'viewing_patient_username']);
      if (isWeb) {
        try {
          window.localStorage.removeItem('admin_session');
        } catch {
          // Ignore
        }
      }
      showFeedback('Logged out');
      speak('Logged out. Returning to home.');
      routerRef.current.replace('/');
      return true;
    }

    // 4. Active Screen Form Actions & Field Filling
    const activeHandler = Array.from(handlersRef.current.values()).pop();

    // 4a. Clear form
    if (clean === 'clear form' || clean === 'clear fields' || clean === 'reset form') {
      if (activeHandler?.clear) {
        activeHandler.clear();
        showFeedback('Cleared form fields');
        speak('Form cleared');
        return true;
      }
    }

    // 4b. Submit / Login / Register trigger
    if (
      clean === 'submit' ||
      clean === 'submit form' ||
      clean === 'login' ||
      clean === 'log in' ||
      clean === 'sign in' ||
      clean === 'register now' ||
      clean === 'create account' ||
      clean === 'confirm' ||
      clean === 'save'
    ) {
      if (activeHandler?.submit) {
        showFeedback('Submitting...');
        speak('Submitting');
        activeHandler.submit();
        return true;
      }
      if (isWeb && tryClickDomElement(clean)) {
        showFeedback(`Clicked "${clean}"`);
        speak(`Clicked ${clean}`);
        return true;
      }
    }

    // 4c. Patient Hub specific actions
    if (clean.includes('start measure') || clean.includes('measure heart rate') || clean.includes('check heart rate') || clean.includes('measure pulse')) {
      if (activeHandler?.triggerAction) {
        showFeedback('Starting heart rate measurement...');
        speak('Starting heart rate measurement');
        activeHandler.triggerAction('START_MEASURE');
        return true;
      }
      showFeedback('Opening Patient Hub...');
      speak('Opening Patient Hub');
      routerRef.current.push('/patient/hub');
      return true;
    }

    // 4c-2. Hamburger Menu Click / Open / Close / Toggle
    if (
      clean === 'close hamburger menu' ||
      clean === 'close hamburger' ||
      clean === 'close menu' ||
      clean === 'hide menu' ||
      clean === 'dismiss menu'
    ) {
      if (triggerHamburgerMenu('close')) return true;
    }

    if (
      clean === 'open hamburger menu' ||
      clean === 'open hamburger' ||
      clean === 'open menu' ||
      clean === 'show menu' ||
      clean === 'open navigation menu'
    ) {
      if (triggerHamburgerMenu('open')) return true;
    }

    if (
      clean === 'hamburger menu' ||
      clean === 'hamburger' ||
      clean === 'click hamburger menu' ||
      clean === 'click hamburger' ||
      clean === 'tap hamburger menu' ||
      clean === 'tap hamburger' ||
      clean === 'press hamburger menu' ||
      clean === 'press hamburger' ||
      clean === 'toggle hamburger menu' ||
      clean === 'toggle hamburger' ||
      clean === 'click menu' ||
      clean === 'tap menu' ||
      clean === 'press menu' ||
      clean === 'toggle menu' ||
      clean === 'navigation menu' ||
      clean === 'menu icon' ||
      clean === 'three lines' ||
      clean.includes('hamburger menu') ||
      clean.includes('click hamburger')
    ) {
      if (triggerHamburgerMenu('toggle')) return true;
    }

    if (clean.includes('nutrition plan') || clean.includes('toggle nutrition')) {
      if (activeHandler?.triggerAction) {
        activeHandler.triggerAction('TOGGLE_NUTRITION');
        showFeedback('Toggled nutrition plan');
        return true;
      }
    }

    if (clean.includes('workout routine') || clean.includes('toggle workout')) {
      if (activeHandler?.triggerAction) {
        activeHandler.triggerAction('TOGGLE_WORKOUT');
        showFeedback('Toggled workout routine');
        return true;
      }
    }

    // 4d. Form Field Input Commands
    const fieldRules: Array<{
      pattern: RegExp;
      field: string;
      domKeywords: string[];
      transform?: (val: string) => string;
    }> = [
      {
        pattern: /(?:enter|set|fill|type|input|write|my)?\s*(confirm password|retype password)\s*(?:is|as|to|with|:)?\s+(.+)/i,
        field: 'confirmPassword',
        domKeywords: ['confirm'],
        transform: (v) => v.replace(/\s+/g, ''),
      },
      {
        pattern: /(?:enter|set|fill|type|input|write|my)?\s*(username|user name|user)\s*(?:is|as|to|with|:)?\s+(.+)/i,
        field: 'username',
        domKeywords: ['username', 'user'],
        transform: (v) => v.replace(/\s+/g, '').toLowerCase(),
      },
      {
        pattern: /(?:enter|set|fill|type|input|write|my)?\s*(password|passcode|pass)\s*(?:is|as|to|with|:)?\s+(.+)/i,
        field: 'password',
        domKeywords: ['password'],
        transform: (v) => v.replace(/\s+/g, ''),
      },
      {
        pattern: /(?:enter|set|fill|type|input|write|my)?\s*(email address|email)\s*(?:is|as|to|with|:)?\s+(.+)/i,
        field: 'email',
        domKeywords: ['email'],
        transform: (v) => v.toLowerCase().replace(/\s+at\s+/g, '@').replace(/\s+dot\s+/g, '.').replace(/\s+/g, ''),
      },
      {
        pattern: /(?:enter|set|fill|type|input|write|my)?\s*(date of birth|dob|birthday|birth date)\s*(?:is|as|to|with|:)?\s+(.+)/i,
        field: 'dob',
        domKeywords: ['birth', 'dob', 'mm/dd'],
      },
      {
        pattern: /(?:enter|set|fill|type|input|write|my)?\s*(first name)\s*(?:is|as|to|with|:)?\s+(.+)/i,
        field: 'firstName',
        domKeywords: ['first', 'john'],
      },
      {
        pattern: /(?:enter|set|fill|type|input|write|my)?\s*(last name)\s*(?:is|as|to|with|:)?\s+(.+)/i,
        field: 'lastName',
        domKeywords: ['last', 'doe'],
      },
      {
        pattern: /(?:enter|set|fill|type|input|write|my)?\s*(full name|name)\s*(?:is|as|to|with|:)?\s+(.+)/i,
        field: 'name',
        domKeywords: ['name', 'jane'],
      },
      {
        pattern: /(?:enter|set|fill|type|input|write|my)?\s*(designation|specialization|specialty)\s*(?:is|as|to|with|:)?\s+(.+)/i,
        field: 'designation',
        domKeywords: ['designation', 'cardiologist', 'specialty'],
      },
      {
        pattern: /(?:select|enter|set|choose)\s*(?:date|day)\s*(?:is|as|to)?\s+(\d{1,2})/i,
        field: 'date',
        domKeywords: ['date'],
      },
    ];

    for (const rule of fieldRules) {
      const match = rawSpeech.match(rule.pattern);
      if (match && match[2]) {
        const rawVal = match[2].trim().replace(/[.,!?]+$/, '');
        const value = rule.transform ? rule.transform(rawVal) : rawVal;
        if (activeHandler?.setField) {
          activeHandler.setField(rule.field, value);
          showFeedback(`Entered ${rule.field}: "${rule.field.toLowerCase().includes('password') ? '••••••' : value}"`);
          speak(`Entered ${rule.field}`);
          return true;
        }
        if (isWeb && tryFillDomInput(rule.domKeywords, value)) {
          showFeedback(`Entered ${rule.field}`);
          speak(`Entered ${rule.field}`);
          return true;
        }
      }
    }

    // 5. Direct URL / Route Navigation
    const urlMatch = rawSpeech.match(/(?:open|go\s+to|navigate\s+to)\s+(?:url|route|page)?\s*(\/[a-zA-Z0-9/_-]+)/i);
    if (urlMatch && urlMatch[1]) {
      const target = urlMatch[1].trim();
      const matched = ROUTE_MAPPINGS.find((r) => r.route.toLowerCase() === target.toLowerCase());
      if (matched) {
        showFeedback(`Navigating to ${matched.route}`);
        speak(`Opening ${matched.aliases[0]}`);
        routerRef.current.push(matched.route as any);
        return true;
      }
    }

    // 6. Keyword Route Navigation (checked in longest-first order)
    for (const entry of ROUTE_MAPPINGS) {
      for (const alias of entry.aliases) {
        if (
          clean === alias ||
          clean.includes(`open ${alias}`) ||
          clean.includes(`go to ${alias}`) ||
          clean.includes(`navigate to ${alias}`) ||
          clean.includes(`show ${alias}`) ||
          clean.includes(`take me to ${alias}`)
        ) {
          showFeedback(`Opening ${alias}...`);
          speak(`Opening ${alias}`);
          routerRef.current.push(entry.route as any);
          return true;
        }
      }
    }

    // 7. Generic Web DOM Click ("click <button text>", "press <button text>", "tap <button text>")
    if (isWeb) {
      const clickMatch = rawSpeech.match(/^(?:click|press|tap|select|open)\s+(.+)$/i);
      if (clickMatch && clickMatch[1]) {
        const label = clickMatch[1].trim();
        if (tryClickDomElement(label)) {
          showFeedback(`Clicked "${label}"`);
          speak(`Clicked ${label}`);
          return true;
        }
      }
    }

    showFeedback(`Heard: "${rawSpeech.trim()}"`);
    return false;
  }, [isWeb, showFeedback, speak, stopListening, triggerHamburgerMenu]);

  executeCommandRef.current = executeCommand;

  const startListening = useCallback(() => {
    if (!isWeb) {
      // Mobile (Android & iOS) audio recording via expo-av
      (async () => {
        try {
          const perm = await Audio.requestPermissionsAsync();
          if (perm.status !== 'granted') {
            showFeedback('Microphone permission required');
            return;
          }
          await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
          });
          const { recording } = await Audio.Recording.createAsync(
            Audio.RecordingOptionsPresets.HIGH_QUALITY
          );
          recordingRef.current = recording;
          isPausedRef.current = false;
          shouldListenRef.current = true;
          setIsPaused(false);
          setIsListening(true);
          showFeedback('Listening... Tap Stop to execute');
        } catch (e) {
          console.warn('Mobile voice start error:', e);
          setIsListening(false);
        }
      })();
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    setIsSupported(true);
    isPausedRef.current = false;
    setIsPaused(false);
    shouldListenRef.current = true;

    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {
        // Ignore
      }
      recognitionRef.current = null;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognition.lang = 'en-US';
      const processedIndices = new Set<number>();

      recognition.onstart = () => {
        setIsListening(true);
        setNeedsGesture(false);
      };

      recognition.onresult = (event: any) => {
        if (isSpeakingRef.current || Date.now() < ignoreRecognitionUntilRef.current) {
          return;
        }
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          if (!res || !res[0]) continue;
          if (res.isFinal) {
            if (processedIndices.has(i)) continue;
            processedIndices.add(i);
            const finalCmd = res[0].transcript.trim();
            if (finalCmd) {
              executeCommandRef.current(finalCmd);
            }
          } else {
            interim += res[0].transcript;
          }
        }
        if (interim.trim()) {
          setTranscript(interim.trim());
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          shouldListenRef.current = false;
          setIsListening(false);
          setNeedsGesture(true);
          showFeedback('Allow microphone access for hands-free voice');
        } else if (event.error === 'no-speech' || event.error === 'aborted') {
          // Normal idle timeout; onend will restart automatically
        }
      };

      recognition.onend = () => {
        setIsListening(false);
        if (recognitionRef.current === recognition) {
          recognitionRef.current = null;
        }
        if (shouldListenRef.current && !isPausedRef.current && !isSpeakingRef.current) {
          restartTimerRef.current = setTimeout(() => {
            if (shouldListenRef.current && !isPausedRef.current && !isSpeakingRef.current && !recognitionRef.current) {
              resumeRecognitionAfterSpeakRef.current();
            }
          }, 350);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListening(false);
      setNeedsGesture(true);
    }
  }, [isWeb, showFeedback]);

  resumeRecognitionAfterSpeakRef.current = startListening;

  const toggleListening = useCallback(() => {
    if (isListening || shouldListenRef.current) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // Hands-free auto-start on web load + mobile support initialization
  useEffect(() => {
    if (!isWeb) {
      setIsSupported(true);
      return () => {
        if (recordingRef.current) {
          recordingRef.current.stopAndUnloadAsync().catch(() => {});
          recordingRef.current = null;
        }
      };
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }
    setIsSupported(true);

    // Attempt immediate hands-free activation
    startListening();

    // If browser requires a user gesture before mic access, auto-start on the first interaction anywhere
    const handleFirstGesture = () => {
      if (isPausedRef.current || isSpeakingRef.current) return;
      if (!shouldListenRef.current || !recognitionRef.current) {
        startListening();
      }
    };

    window.addEventListener('pointerdown', handleFirstGesture, { passive: true });
    window.addEventListener('keydown', handleFirstGesture, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', handleFirstGesture);
      window.removeEventListener('keydown', handleFirstGesture);
      shouldListenRef.current = false;
      isSpeakingRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
      if (speakSafetyTimerRef.current) clearTimeout(speakSafetyTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch {
          // Ignore
        }
        recognitionRef.current = null;
      }
    };
  }, [isWeb]);

  return (
    <WebVoiceContext.Provider
      value={{
        isListening,
        isSupported,
        needsGesture,
        isPaused,
        transcript,
        feedback,
        startListening,
        stopListening,
        toggleListening,
        speak,
        executeCommand,
        triggerHamburgerMenu,
        registerFormHandler,
        unregisterFormHandler,
      }}
    >
      {children}
    </WebVoiceContext.Provider>
  );
};

export const useWebVoice = () => {
  const ctx = useContext(WebVoiceContext);
  if (!ctx) {
    throw new Error('useWebVoice must be used within a WebVoiceProvider');
  }
  return ctx;
};
