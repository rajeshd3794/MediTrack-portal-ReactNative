import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Modal, Pressable, Image, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Device from 'expo-device';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function Landing() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAdminVisible, setIsAdminVisible] = useState(false);
  const [logoTapCount, setLogoTapCount] = useState(0);

  useEffect(() => {
    const handleAccessLogic = async () => {
      // 1. Check for URL Activation (Web/PC)
      if (params.admin) {
        if (params.admin === 'enable') {
          await AsyncStorage.setItem('admin_access_token', 'dronavalli_secure_token');
          setIsAdminVisible(true);
          alert('Admin Portal has been activated for this device.');
          return;
        } else if (params.admin === 'disable') {
          await AsyncStorage.removeItem('admin_access_token');
          setIsAdminVisible(false);
          alert('Admin Portal has been hidden.');
          return;
        }
      }

      // 2. Check for existing Web Token
      const storedToken = await AsyncStorage.getItem('admin_access_token');
      if (storedToken === 'dronavalli_secure_token') {
        setIsAdminVisible(true);
        return;
      }

      // 3. Check Mobile Device Name (Strict Match)
      if (Platform.OS !== 'web') {
        const deviceName = Device.deviceName;
        if (deviceName && deviceName.toLowerCase().includes('dronavalli')) {
          setIsAdminVisible(true);
          return;
        }
      }

      // 4. Default: Hidden
      setIsAdminVisible(false);
    };

    handleAccessLogic();
  }, [params.admin]);

  const handleLogoTap = async () => {
    const newCount = logoTapCount + 1;
    setLogoTapCount(newCount);
    
    if (newCount >= 7) {
      await AsyncStorage.setItem('admin_access_token', 'dronavalli_secure_token');
      setIsAdminVisible(true);
      setLogoTapCount(0);
      alert('Admin Access Activated!');
    }
  };

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);

  const navigateTo = (path: string) => {
    setIsMenuOpen(false);
    router.push(path as any);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      {/* Hamburger Toggle */}
      <TouchableOpacity style={styles.hamburgerButton} onPress={toggleMenu} activeOpacity={0.7}>
        <View style={styles.hamburgerLine} />
        <View style={styles.hamburgerLine} />
        <View style={styles.hamburgerLine} />
      </TouchableOpacity>

      {/* Menu Modal */}
      <Modal
        visible={isMenuOpen}
        transparent={true}
        animationType="fade"
        onRequestClose={toggleMenu}
      >
        <Pressable style={styles.modalOverlay} onPress={toggleMenu}>
          <View style={styles.menuDropdown}>
            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => navigateTo('/admin-login')}
            >
              <Text style={styles.menuItemText}>Admin</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => navigateTo('/doctor-login')}
            >
              <Text style={styles.menuItemText}>Doctors</Text>
            </TouchableOpacity>
            <View style={styles.menuDivider} />
            <TouchableOpacity 
              style={styles.menuItem} 
              onPress={() => navigateTo('/patient-auth')}
            >
              <Text style={styles.menuItemText}>Patients</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity activeOpacity={1} onPress={handleLogoTap}>
            <Text style={styles.title}>MediTrack</Text>
          </TouchableOpacity>
          <Text style={styles.subtitle}>MediTrack Records</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  hamburgerButton: {
    position: 'absolute',
    top: 60,
    right: 24,
    zIndex: 100,
    padding: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  hamburgerLine: {
    width: 20,
    height: 2,
    backgroundColor: '#1A365D',
    borderRadius: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  menuDropdown: {
    marginTop: 110,
    marginRight: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: 180,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  menuItem: {
    padding: 16,
    width: '100%',
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3748',
  },
  menuDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    width: '100%',
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 60,
    position: 'relative',
    width: '100%',
    justifyContent: 'center',
  },
  title: {
    fontSize: 42,
    fontWeight: '800',
    color: '#1A365D',
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 16,
    color: '#4A5568',
    marginTop: 8,
    fontWeight: '500',
  },
});
