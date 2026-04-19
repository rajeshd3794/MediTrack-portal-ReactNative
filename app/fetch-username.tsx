import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { getDoctorByNameAndEmail } from '../db/db';

export default function FetchUsername() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!firstName || !lastName || !email) {
      setError('Please fill in all the required fields.');
      setUsername(null);
      return;
    }

    setLoading(true);
    setError('');
    setUsername(null);

    try {
      const doctor = await getDoctorByNameAndEmail(firstName, lastName, email);
      if (doctor) {
        setUsername(doctor.username);
      } else {
        setError('No account found matching those details.');
      }
    } catch (e: any) {
      console.error('Failed to fetch username', e);
      setError('Database error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.centerCard}>
            <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
              <Text style={styles.backText}>← Back to Login</Text>
            </TouchableOpacity>

            <View style={styles.header}>
              <Text style={styles.title}>Forgot Username</Text>
              <Text style={styles.subtitle}>Enter your details to retrieve your username</Text>
            </View>

            <View style={styles.form}>
              {error ? <Text style={styles.errorText}>{error}</Text> : null}
              
              {username && (
                <View style={styles.successContainer}>
                  <Text style={styles.successLabel}>Your Username is:</Text>
                  <Text style={styles.usernameText}>{username}</Text>
                  <TouchableOpacity 
                    style={styles.loginLinkButton} 
                    onPress={() => router.replace('/patient-auth')}
                  >
                    <Text style={styles.loginLinkText}>Back to Login</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.inputContainer}>
                <Text style={styles.label}>First Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your first name"
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholderTextColor="#A0AEC0"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Last Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter your last name"
                  value={lastName}
                  onChangeText={setLastName}
                  placeholderTextColor="#A0AEC0"
                />
              </View>

              <View style={styles.inputContainer}>
                <Text style={styles.label}>Registered Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="doctor@hospital.com"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  placeholderTextColor="#A0AEC0"
                />
              </View>

              <TouchableOpacity 
                style={[styles.submitButton, loading && { opacity: 0.7 }]} 
                onPress={handleSubmit}
                disabled={loading}
              >
                <Text style={styles.submitButtonText}>
                  {loading ? 'Retrieving...' : 'Submit'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerCard: {
    width: '100%',
    maxWidth: 450,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.1,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 20,
  },
  backText: {
    fontSize: 16,
    color: '#3182CE',
    fontWeight: '600',
  },
  header: {
    marginBottom: 32,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#1A365D',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#4A5568',
    textAlign: 'center',
  },
  form: {
    gap: 20,
  },
  inputContainer: {
    gap: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4A5568',
  },
  input: {
    backgroundColor: '#F7FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: '#2D3748',
  },
  submitButton: {
    backgroundColor: '#3182CE',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#3182CE',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: '#E53E3E',
    fontSize: 14,
    fontWeight: '500',
    backgroundColor: '#FFF5F5',
    padding: 12,
    borderRadius: 8,
    overflow: 'hidden',
    textAlign: 'center',
  },
  successContainer: {
    backgroundColor: '#F0FFF4',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C6F6D5',
    alignItems: 'center',
    marginBottom: 10,
  },
  successLabel: {
    fontSize: 16,
    color: '#2F855A',
    marginBottom: 8,
  },
  usernameText: {
    fontSize: 24,
    fontWeight: '800',
    color: '#22543D',
    marginBottom: 16,
  },
  loginLinkButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#C6F6D5',
  },
  loginLinkText: {
    color: '#22543D',
    fontWeight: '700',
    fontSize: 14,
  }
});
