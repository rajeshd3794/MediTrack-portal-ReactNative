import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useWebVoice, VoiceFormHandler } from '../context/WebVoiceContext';

/**
 * Registers the currently focused screen's voice form, hamburger menu, and action handlers
 * with WebVoiceContext. Uses useFocusEffect + a ref proxy so only the active screen responds
 * and callbacks always access the latest React state (no stale closures).
 */
export const useVoiceForm = (pageKey: string, handler: VoiceFormHandler) => {
  const { registerFormHandler, unregisterFormHandler } = useWebVoice();
  const handlerRef = useRef<VoiceFormHandler>(handler);
  handlerRef.current = handler;

  useFocusEffect(
    useCallback(() => {
      const proxyHandler: VoiceFormHandler = {
        setField: (field, value) => handlerRef.current.setField?.(field, value),
        submit: () => handlerRef.current.submit?.(),
        clear: () => handlerRef.current.clear?.(),
        onHamburgerMenuClick: (mode) => handlerRef.current.onHamburgerMenuClick?.(mode),
        triggerAction: (actionName, payload) => handlerRef.current.triggerAction?.(actionName, payload),
      };

      registerFormHandler(pageKey, proxyHandler);
      return () => {
        unregisterFormHandler(pageKey);
      };
    }, [pageKey, registerFormHandler, unregisterFormHandler])
  );
};
