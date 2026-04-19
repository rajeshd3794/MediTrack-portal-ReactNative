import * as SQLite from 'expo-sqlite';
import { supabase } from './supabaseClient';
import { apiFetch } from './apiClient';

// Security: Simple input sanitization to prevent common XSS and injection patterns
export const sanitizeInput = (val: string): string => {
  if (typeof val !== 'string') return val;
  return val.replace(/[<>]/g, '').trim(); 
};

// --- Reversible Encryption Helpers ---
const PWD_SHIFT = 5;
export const encryptPassword = (pwd: string): string => {
  if (!pwd || pwd.startsWith('v2_')) return pwd;
  return 'v2_' + pwd.split('').map(c => (c.charCodeAt(0) + PWD_SHIFT).toString(16).padStart(2, '0')).join('');
};

export const decryptPassword = (enc: string): string => {
  if (!enc || !enc.startsWith('v2_')) return enc;
  const hex = enc.substring(3);
  let res = '';
  for (let i = 0; i < hex.length; i += 2) {
    const code = parseInt(hex.substring(i, i + 2), 16);
    if (isNaN(code)) return enc; 
    res += String.fromCharCode(code - PWD_SHIFT);
  }
  return res;
};

let dbPromise: Promise<any> | null = null;

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      try {
        const db = await SQLite.openDatabaseAsync('medicore.db');

        await db.execAsync(`
          PRAGMA journal_mode = WAL;
          CREATE TABLE IF NOT EXISTS Doctors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            firstName TEXT NOT NULL,
            lastName TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            designation TEXT NOT NULL,
            password TEXT NOT NULL,
            timestamp INTEGER,
            timezone TEXT
          );
          CREATE TABLE IF NOT EXISTS Patients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            dob TEXT NOT NULL,
            password TEXT NOT NULL,
            nextAppointment TEXT,
            age INTEGER,
            condition TEXT,
            status TEXT,
            timestamp INTEGER,
            notes TEXT
          );
          CREATE TABLE IF NOT EXISTS PatientHistory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patientUsername TEXT NOT NULL,
            date TEXT NOT NULL,
            event TEXT NOT NULL,
            details TEXT,
            FOREIGN KEY (patientUsername) REFERENCES Patients(username)
          );
          CREATE TABLE IF NOT EXISTS Appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patient_id INTEGER NOT NULL,
            doctor_id INTEGER NOT NULL,
            appointment_date TEXT NOT NULL,
            status TEXT DEFAULT 'Pending'
          );
        `);

        // Seed default doctor
        try {
          const existingDoctor = await db.getFirstAsync('SELECT * FROM Doctors WHERE username = ?', ['admin']);
          if (!existingDoctor) {
            await db.runAsync(
              'INSERT INTO Doctors (firstName, lastName, username, email, designation, password, timestamp, timezone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              ['Admin', 'User', 'admin', 'admin@medicore.com', 'Administrator', 'password123', Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone]
            );
          }
        } catch (e) {}

        // Seed default patient
        try {
          const existingPatient = await db.getFirstAsync('SELECT * FROM Patients WHERE username = ?', ['patient']);
          if (!existingPatient) {
            await db.runAsync(
              'INSERT INTO Patients (name, username, email, dob, password, nextAppointment, age, condition, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              ['John Doe', 'patient', 'patient@example.com', '01/01/1990', encryptPassword('password123'), 'Oct 15, 10:00 AM', 34, 'General Checkup', 'Stable', Date.now()]
            );
          }
        } catch (e) {}
        
        try {
          await db.execAsync('ALTER TABLE Patients ADD COLUMN notes TEXT;');
        } catch (e) {}

        return db;
      } catch (e) {
        console.warn('Failed to initialize SQLite:', e);
        return null;
      }
    })();
  }
  return await dbPromise;
}

export async function initDatabase() {
  await getDb();
}

// --- Interfaces ---

export interface Doctor {
  id?: number;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  designation: string;
  password: string;
  timestamp?: number;
  timezone?: string;
}

export interface Patient {
  id?: number;
  name: string;
  username: string;
  email: string;
  dob: string;
  password: string;
  nextAppointment?: string;
  age?: number;
  condition?: string;
  status?: string;
  timestamp?: number;
  notes?: string;
}

export interface PatientHistoryItem {
  id?: number;
  patientUsername: string;
  date: string;
  event: string;
  details?: string;
}

export interface Appointment {
  id?: number;
  patient_id: number;
  doctor_id: number;
  appointment_date: string;
  status?: string;
  patient_name?: string;
  patients?: {name?: string, username?: string, condition?: string};
}

// --- Mappings ---

const mapDoctorToCloud = (doc: Doctor) => ({
  firstname: sanitizeInput(doc.firstName),
  lastname: sanitizeInput(doc.lastName),
  username: sanitizeInput(doc.username),
  email: sanitizeInput(doc.email),
  designation: sanitizeInput(doc.designation),
  password: encryptPassword(doc.password),
  timestamp: doc.timestamp || Date.now(),
  timezone: doc.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
});

const mapCloudToDoctor = (row: any): Doctor => ({
  id: row.id,
  firstName: row.firstname,
  lastName: row.lastname,
  username: row.username,
  email: row.email,
  designation: row.designation,
  password: decryptPassword(row.password),
  timestamp: row.timestamp,
  timezone: row.timezone
});

const mapPatientToCloud = (pat: Patient) => ({
  name: pat.name,
  username: pat.username,
  email: pat.email,
  dob: pat.dob,
  password: encryptPassword(pat.password),
  nextappointment: pat.nextAppointment || 'Pending',
  age: pat.age || 30,
  condition: pat.condition || 'General Checkup',
  status: pat.status || 'New',
  timestamp: pat.timestamp || Date.now(),
  notes: pat.notes || null
});

const mapCloudToPatient = (row: any): Patient => ({
  id: row.id,
  name: row.name,
  username: row.username,
  email: row.email,
  dob: row.dob,
  password: decryptPassword(row.password),
  nextAppointment: row.nextappointment,
  age: row.age,
  condition: row.condition,
  status: row.status,
  timestamp: row.timestamp,
  notes: row.notes
});

const mapHistoryToCloud = (h: PatientHistoryItem) => ({
  patientusername: h.patientUsername,
  date: h.date,
  event: h.event,
  details: h.details
});

const mapCloudToHistory = (row: any): PatientHistoryItem => ({
  id: row.id,
  patientUsername: row.patientusername,
  date: row.date,
  event: row.event,
  details: row.details
});

const mapAppointmentsToCloud = (appt: Appointment) => ({
  patient_id: appt.patient_id,
  doctor_id: appt.doctor_id,
  appointment_date: appt.appointment_date,
  status: appt.status || 'Pending'
});

const mapCloudToAppointments = (row: any): Appointment => ({
  id: row.id,
  patient_id: row.patient_id,
  doctor_id: row.doctor_id,
  appointment_date: row.appointment_date,
  status: row.status,
  patients: row.patients
});

// --- Doctor Functions ---

export async function addDoctor(doctor: Doctor) {
  const { error } = await supabase.from('doctors').insert([mapDoctorToCloud(doctor)]);
  if (error) throw new Error(`Cloud storage error: ${error.message}`);
  return { success: true }; 
}

export async function getDoctorByUsername(username: string): Promise<Doctor | null> {
  const { data, error } = await supabase.from('doctors').select('*').eq('username', sanitizeInput(username)).single();
  if (!error && data) return mapCloudToDoctor(data);
  const db = await getDb();
  if (db) {
    const doc = await db.getFirstAsync('SELECT * FROM Doctors WHERE username = ?', [sanitizeInput(username)]) as Doctor | null;
    if (doc) doc.password = decryptPassword(doc.password);
    return doc;
  }
  return null;
}

export async function getAllDoctors(): Promise<Doctor[]> {
  const { data, error } = await supabase.from('doctors').select('*').order('timestamp', { ascending: false });
  if (!error && data) return data.map(mapCloudToDoctor);
  const db = await getDb();
  if (db) {
    const rows = await db.getAllAsync('SELECT * FROM Doctors') as Doctor[];
    return rows.map(r => ({...r, password: decryptPassword(r.password)}));
  }
  return [];
}

export async function getDoctorByEmail(email: string): Promise<Doctor | null> {
  const { data, error } = await supabase.from('doctors').select('*').eq('email', sanitizeInput(email)).single();
  if (!error && data) return mapCloudToDoctor(data);
  const db = await getDb();
  if (db) {
    const doc = await db.getFirstAsync('SELECT * FROM Doctors WHERE email = ?', [sanitizeInput(email)]) as Doctor | null;
    if (doc) doc.password = decryptPassword(doc.password);
    return doc;
  }
  return null;
}

export async function updateDoctorPasswordByEmail(email: string, newPassword: string): Promise<void> {
  const { error } = await supabase.from('doctors').update({ password: encryptPassword(newPassword) }).eq('email', email);
  if (error) throw new Error(`Cloud update failed: ${error.message}`);
}

// --- Patient Functions ---

export async function addPatient(patient: Patient) {
  const { error } = await supabase.from('patients').insert([mapPatientToCloud(patient)]);
  if (error) throw new Error(`Cloud storage error: ${error.message}`);
  const db = await getDb();
  if (db) {
    await db.runAsync(
      'INSERT INTO Patients (name, username, email, dob, password, nextAppointment, age, condition, status, timestamp, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [patient.name, patient.username, patient.email, patient.dob, encryptPassword(patient.password), patient.nextAppointment || 'Pending', patient.age || 30, patient.condition || 'General Checkup', patient.status || 'New', patient.timestamp || Date.now(), patient.notes || null]
    );
  }
  return { success: true };
}

export async function getAllPatients(): Promise<Patient[]> {
  const { data, error } = await supabase.from('patients').select('*').order('timestamp', { ascending: false });
  if (!error && data) return data.map(mapCloudToPatient);
  const db = await getDb();
  if (db) {
    const rows = await db.getAllAsync('SELECT * FROM Patients ORDER BY timestamp DESC') as Patient[];
    return rows.map(r => ({...r, password: decryptPassword(r.password)}));
  }
  return [];
}

export async function updatePatient(patient: Patient): Promise<void> {
  const { error } = await supabase.from('patients').update(mapPatientToCloud(patient)).eq('username', patient.username);
  if (error) throw new Error(`Cloud update failed: ${error.message}`);
  const db = await getDb();
  if (db) {
    await db.runAsync(
      'UPDATE Patients SET name = ?, email = ?, dob = ?, password = ?, nextAppointment = ?, age = ?, condition = ?, status = ?, notes = ? WHERE username = ?',
      [patient.name, patient.email, patient.dob, encryptPassword(patient.password), patient.nextAppointment ?? null, patient.age ?? null, patient.condition ?? null, patient.status ?? null, patient.notes || null, patient.username]
    );
  }
}

// --- Appointment Functions ---

export async function addAppointments(appt: Appointment): Promise<void> {
  // Sync to Cloud via Backend API
  try {
    const { error } = await apiFetch('/appointments', {
      method: 'POST',
      body: JSON.stringify(mapAppointmentsToCloud(appt))
    });
    if (error) console.warn('Supabase addAppointments sync failed:', error.message);
  } catch (e) {
    console.warn('API sync error:', e);
  }

  // Local Cache
  const db = await getDb();
  if (db) {
    await db.runAsync(
      'INSERT INTO Appointments (patient_id, doctor_id, appointment_date, status) VALUES (?, ?, ?, ?)',
      [appt.patient_id, appt.doctor_id, appt.appointment_date, appt.status || 'Pending']
    );
  }
}

export async function getAppointmentbyAppId(id: number): Promise<Appointment | null> {
  const { data, error } = await apiFetch(`/appointments/${id}`);
  if (!error && data) return mapCloudToAppointments(data);
  const db = await getDb();
  if (db) {
    return await db.getFirstAsync('SELECT * FROM Appointments WHERE id = ?', [id]) as Appointment | null;
  }
  return null;
}

export async function getAllAppointments(): Promise<Appointment[]> {
  try {
    const { data, error } = await apiFetch('/appointments');
    if (!error && data && data.success && Array.isArray(data.data)) {
      console.log(`Sync: Fetched ${data.data.length} appointments from cloud.`);
      return data.data.map(mapCloudToAppointments);
    }
    if (error) console.warn('Fetch appointments from cloud failed:', error.message);
  } catch (err) {
    console.error('getAllAppointments sync error:', err);
  }

  const db = await getDb();
  if (db) {
    console.log('Sync: Falling back to local SQLite for appointments.');
    return await db.getAllAsync('SELECT * FROM Appointments ORDER BY appointment_date ASC') as Appointment[];
  }
  return [];
}

export async function updateAppointmentStatus(id: string | number, status: string): Promise<void> {
  try {
    const { error } = await apiFetch(`/appointments/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    });
    if (error) console.warn('Supabase update status failed:', error.message);
  } catch (e) {}

  const db = await getDb();
  if (db) {
    await db.runAsync('UPDATE Appointments SET status = ? WHERE id = ?', [status, id]);
  }
}

export async function updateAppointment(id: string | number, data: Partial<Appointment>): Promise<void> {
  // 1. Sync to Cloud
  try {
    const { error } = await apiFetch(`/appointments/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (error) console.warn('Supabase updateAppointment sync failed:', error.message);
  } catch (e) {}

  // 2. Local Update
  try {
    const db = await getDb();
    if (db) {
      if (data.appointment_date) {
        await db.runAsync('UPDATE Appointments SET appointment_date = ? WHERE id = ?', [data.appointment_date, id]);
      }
      if (data.status) {
        await db.runAsync('UPDATE Appointments SET status = ? WHERE id = ?', [data.status, id]);
      }
    }
  } catch (e) {
    console.warn('Local updateAppointment failed:', e);
  }
}

export async function deleteAppointment(id: string | number): Promise<void> {
  try {
    const { error } = await apiFetch(`/appointments/${id}`, {
      method: 'DELETE'
    });
    if (error) console.warn('Supabase delete failed:', error.message);
  } catch (e) {}

  const db = await getDb();
  if (db) {
    await db.runAsync('DELETE FROM Appointments WHERE id = ?', [id]);
  }
}

// --- Other Logic ---

export async function migrateLocalToCloud(): Promise<{ doctorsMoved: number, patientsMoved: number }> {
  const db = await getDb();
  const localDoctors = await db.getAllAsync('SELECT * FROM Doctors') as Doctor[];
  let doctorsMoved = 0;
  for (const doc of localDoctors) {
    const { error } = await supabase.from('doctors').upsert(mapDoctorToCloud(doc), { onConflict: 'username' });
    if (!error) doctorsMoved++;
  }

  const localPatients = await db.getAllAsync('SELECT * FROM Patients') as Patient[];
  let patientsMoved = 0;
  for (const pat of localPatients) {
    const { error } = await supabase.from('patients').upsert(mapPatientToCloud(pat), { onConflict: 'username' });
    if (!error) patientsMoved++;
  }
  return { doctorsMoved, patientsMoved };
}

export async function verifyAdmin(username: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.from('doctors').select('id, password').eq('username', username.trim().toLowerCase()).single();
  if (error || !data) return false;
  return decryptPassword(data.password) === password;
}

export async function verifyPatient(username: string, password: string): Promise<boolean> {
  const { data, error } = await supabase.from('patients').select('username, password').eq('username', username.trim()).single();
  if (error || !data) return false;
  return decryptPassword(data.password) === password;
}

export async function checkAndAutoUpdateAppointments(): Promise<void> {
  try {
    const patients = await getAllPatients();
    const now = Date.now();
    for (const p of patients) {
      if (p.nextAppointment && !['Completed', 'Pending', 'None'].includes(p.nextAppointment)) {
        const apptTime = new Date(p.nextAppointment).getTime();
        if (!isNaN(apptTime) && (now - apptTime > 60000)) {
          await updatePatient({ ...p, nextAppointment: 'Completed' });
        }
      }
    }
  } catch (e) {}
}
