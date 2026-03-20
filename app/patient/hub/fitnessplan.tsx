import React from 'react';
import { View, Text, StyleSheet, SafeAreaView, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function PatientFitnessPlan() {
  const router = useRouter();

  const plans = [
    {
      months: '1 Month',
      title: 'Foundation Phase',
      goals: ['10,000 steps/day', '3 workouts/week'],
      color: '#4299E1',
      icon: '🌱'
    },
    {
      months: '3 Months',
      title: 'Endurance Boost',
      goals: ['Increase workout duration by 10%', 'Interval training sessions'],
      color: '#48BB78',
      icon: '🏃'
    },
    {
      months: '6 Months',
      title: 'Strength & Body',
      goals: ['Resistance training', 'Track body metrics & lean mass'],
      color: '#F6AD55',
      icon: '💪'
    },
    {
      months: '9 Months',
      title: 'Health Targeting',
      goals: ['Refine workouts for specific health targets', 'Advanced intensity'],
      color: '#F56565',
      icon: '🎯'
    },
    {
      months: '12 Months',
      title: 'Sustainability',
      goals: ['Sustain high activity levels', 'Monitor long-term health improvements'],
      color: '#805AD5',
      icon: '🏆'
    }
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Fitness Journey</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.introCard}>
          <Text style={styles.introTitle}>Your Personalized Roadmap</Text>
          <Text style={styles.introSubtitle}>
            A structured plan tailored to your health status and long-term wellness goals.
          </Text>
        </View>

        <View style={styles.timeline}>
          {plans.map((plan, index) => (
            <View key={index} style={styles.timelineItem}>
              <View style={styles.timelineLeft}>
                <View style={[styles.timelineIconContainer, { backgroundColor: plan.color }]}>
                  <Text style={styles.timelineEmoji}>{plan.icon}</Text>
                </View>
                {index !== plans.length - 1 && <View style={styles.timelineLine} />}
              </View>
              <View style={styles.timelineRight}>
                <View style={styles.planCard}>
                  <Text style={[styles.planMonths, { color: plan.color }]}>{plan.months}</Text>
                  <Text style={styles.planTitle}>{plan.title}</Text>
                  <View style={styles.goalsContainer}>
                    {plan.goals.map((goal, gIndex) => (
                      <View key={gIndex} style={styles.goalRow}>
                        <Text style={styles.goalBullet}>•</Text>
                        <Text style={styles.goalText}>{goal}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </View>
            </View>
          ))}
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
  introCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  introTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#2D3748',
    marginBottom: 8,
  },
  introSubtitle: {
    fontSize: 14,
    color: '#718096',
    lineHeight: 20,
  },
  timeline: {
    paddingLeft: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 24,
  },
  timelineLeft: {
    alignItems: 'center',
    marginRight: 16,
  },
  timelineIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  timelineEmoji: {
    fontSize: 24,
  },
  timelineLine: {
    width: 4,
    backgroundColor: '#E2E8F0',
    flex: 1,
    position: 'absolute',
    top: 48,
    bottom: -24,
    borderRadius: 2,
  },
  timelineRight: {
    flex: 1,
    justifyContent: 'center',
  },
  planCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F7FAFC',
  },
  planMonths: {
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  planTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1A365D',
    marginBottom: 12,
  },
  goalsContainer: {
    gap: 8,
  },
  goalRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  goalBullet: {
    color: '#CBD5E0',
    marginRight: 8,
    fontSize: 18,
    lineHeight: 20,
  },
  goalText: {
    fontSize: 14,
    color: '#4A5568',
    flex: 1,
    lineHeight: 20,
  },
});
