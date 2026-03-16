import * as SQLite from 'expo-sqlite';
import { supabase } from './supabaseClient';

// Security: Simple input sanitization to prevent common XSS and injection patterns
export const sanitizeInput = (val: string): string => {
  if (typeof val !== 'string') return val;
  return val.replace(/[<>]/g, '').trim(); 
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
            timestamp INTEGER
          );
          CREATE TABLE IF NOT EXISTS PatientHistory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            patientUsername TEXT NOT NULL,
            date TEXT NOT NULL,
            event TEXT NOT NULL,
            details TEXT,
            FOREIGN KEY (patientUsername) REFERENCES Patients(username)
          );
        `);

        // Seed default doctor if not exists
        try {
          const existingDoctor = await db.getFirstAsync('SELECT * FROM Doctors WHERE username = ?', ['admin']) as Doctor | null;
          if (!existingDoctor) {
            await db.runAsync(
              'INSERT INTO Doctors (firstName, lastName, username, email, designation, password, timestamp, timezone) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              ['Admin', 'User', 'admin', 'admin@medicore.com', 'Administrator', 'password123', Date.now(), Intl.DateTimeFormat().resolvedOptions().timeZone]
            );
          }
        } catch (e) {}

          // Seed default patient if not exists
        try {
          const existingPatient = await db.getFirstAsync('SELECT * FROM Patients WHERE username = ?', ['patient']) as Patient | null;
          if (!existingPatient) {
            await db.runAsync(
              'INSERT INTO Patients (name, username, email, dob, password, nextAppointment, age, condition, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              ['John Doe', 'patient', 'patient@example.com', '01/01/1990', 'password123', 'Oct 15, 10:00 AM', 34, 'General Checkup', 'Stable', Date.now()]
            );
          }
        } catch (e) {}

        console.log('Database and Tables initialized');
        return db;
      } catch (e) {
        console.warn('Failed to initialize SQLite:', e);
        return null; // Return null so callers know SQLite is unavailable
      }
    })();
  }
  return await dbPromise;
}

export async function initDatabase() {
  await getDb(); // Triggers initialization
}

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
}

export interface PatientHistoryItem {
  id?: number;
  patientUsername: string;
  date: string;
  event: string;
  details?: string;
}

// --- Supabase Mapping Helpers ---
// Postgres folds unquoted column names to lowercase. These helpers bridge camelCase JS to lowercase DB.

const mapDoctorToCloud = (doc: Doctor) => ({
  firstname: sanitizeInput(doc.firstName),
  lastname: sanitizeInput(doc.lastName),
  username: sanitizeInput(doc.username),
  email: sanitizeInput(doc.email),
  designation: sanitizeInput(doc.designation),
  password: sanitizeInput(doc.password),
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
  password: row.password,
  timestamp: row.timestamp,
  timezone: row.timezone
});

const mapPatientToCloud = (pat: Patient) => ({
  name: pat.name,
  username: pat.username,
  email: pat.email,
  dob: pat.dob,
  password: pat.password,
  nextappointment: pat.nextAppointment || 'Pending',
  age: pat.age || 30,
  condition: pat.condition || 'General Checkup',
  status: pat.status || 'New',
  timestamp: pat.timestamp || Date.now()
});

const mapCloudToPatient = (row: any): Patient => ({
  id: row.id,
  name: row.name,
  username: row.username,
  email: row.email,
  dob: row.dob,
  password: row.password,
  nextAppointment: row.nextappointment,
  age: row.age,
  condition: row.condition,
  status: row.status,
  timestamp: row.timestamp
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

export async function addDoctor(doctor: Doctor) {
  // 1. Save to Supabase Cloud
  const { error } = await supabase
    .from('doctors')
    .insert([mapDoctorToCloud(doctor)]);

  if (error) {
    console.error('Supabase addDoctor failed:', error.message, error.details);
    throw new Error(`Cloud storage error: ${error.message}`);
  }

  return { success: true }; 
}

export async function getDoctorByUsername(username: string): Promise<Doctor | null> {
  // 1. Try Cloud
  const { data, error } = await supabase
    .from('doctors')
    .select('*')
    .eq('username', sanitizeInput(username))
    .single();
  
  if (!error && data) return mapCloudToDoctor(data);

  // 2. Try Local
  try {
    const db = await getDb();
    if (db) {
      return await db.getFirstAsync('SELECT * FROM Doctors WHERE username = ?', [sanitizeInput(username)]) as Doctor | null;
    }
  } catch (e) {
    console.warn('Local getDoctorByUsername failed:', e);
  }
  return null;
}

export async function getAllDoctors(): Promise<Doctor[]> {
  // 1. Try fetching from Supabase (Global Cloud)
  const { data, error } = await supabase
    .from('doctors')
    .select('*')
    .order('timestamp', { ascending: false });

  if (!error && data) {
    return data.map(mapCloudToDoctor);
  }

  // 2. Fallback to Local SQLite
  try {
    const db = await getDb();
    if (db) {
      console.log('Fetching doctors from local storage...');
      return await db.getAllAsync('SELECT * FROM Doctors') as Doctor[];
    }
  } catch (e) {
    console.warn('Local getAllDoctors failed:', e);
  }
  return [];
}

/**
 * Migrates all local SQLite records to the Supabase Cloud.
 * This ensures "move all records of the doctors table data from local storage to server storage".
 */
export async function migrateLocalToCloud(): Promise<{ doctorsMoved: number, patientsMoved: number }> {
  const db = await getDb();
  
  // 1. Migrate Doctors
  const localDoctors = await db.getAllAsync('SELECT * FROM Doctors') as Doctor[];
  let doctorsMoved = 0;
  for (const doc of localDoctors) {
    const { error } = await supabase
      .from('doctors')
      .upsert(mapDoctorToCloud(doc), { onConflict: 'username' });
    
    if (error) {
      console.error(`Failed to migrate doctor ${doc.username}:`, error.message);
    } else {
      doctorsMoved++;
    }
  }

  // 2. Migrate Patients
  const localPatients = await db.getAllAsync('SELECT * FROM Patients') as Patient[];
  let patientsMoved = 0;
  for (const pat of localPatients) {
    const { error } = await supabase
      .from('patients')
      .upsert(mapPatientToCloud(pat), { onConflict: 'username' });
    
    if (error) {
      console.error(`Failed to migrate patient ${pat.username}:`, error.message);
    } else {
      patientsMoved++;
    }
  }

  console.log(`Migration complete: ${doctorsMoved} doctors, ${patientsMoved} patients.`);
  return { doctorsMoved, patientsMoved };
}

export async function syncGlobalDoctors(): Promise<void> {
  // Now simply triggers the migration/sync
  await migrateLocalToCloud();
}

export async function getDoctorByEmail(email: string): Promise<Doctor | null> {
  // 1. Try Cloud
  const { data, error } = await supabase
    .from('doctors')
    .select('*')
    .eq('email', sanitizeInput(email))
    .single();
  
  if (!error && data) return mapCloudToDoctor(data);

  // 2. Try Local
  try {
    const db = await getDb();
    if (db) {
      return await db.getFirstAsync('SELECT * FROM Doctors WHERE email = ?', [sanitizeInput(email)]) as Doctor | null;
    }
  } catch (e) {
    console.warn('Local getDoctorByEmail failed:', e);
  }
  return null;
}

export async function getDoctorByNameAndEmail(firstName: string, lastName: string, email: string): Promise<Doctor | null> {
  // 1. Try Cloud
  const { data, error } = await supabase
    .from('doctors')
    .select('*')
    .eq('firstname', sanitizeInput(firstName))
    .eq('lastname', sanitizeInput(lastName))
    .eq('email', sanitizeInput(email))
    .single();
  
  if (!error && data) return mapCloudToDoctor(data);

  // 2. Try Local
  try {
    const db = await getDb();
    if (db) {
      return await db.getFirstAsync(
        'SELECT * FROM Doctors WHERE firstName = ? AND lastName = ? AND email = ?',
        [firstName, lastName, email]
      ) as Doctor | null;
    }
  } catch (e) {
    console.warn('Local getDoctorByNameAndEmail failed:', e);
  }
  return null;
}

export async function updateDoctorPassword(username: string, newPassword: string): Promise<void> {
  // 1. Sync to Cloud
  const { error } = await supabase
    .from('doctors')
    .update({ password: sanitizeInput(newPassword) })
    .eq('username', sanitizeInput(username));
  
  if (error) {
    console.error('Supabase updateDoctorPassword failed:', error.message);
    throw new Error(`Cloud update failed: ${error.message}`);
  }
}

export async function updateDoctorPasswordByEmail(email: string, newPassword: string): Promise<void> {
  // 1. Sync to Cloud
  const { error } = await supabase
    .from('doctors')
    .update({ password: newPassword })
    .eq('email', email);
  
  if (error) {
    console.error('Supabase updateDoctorPasswordByEmail failed:', error.message);
    throw new Error(`Cloud update failed: ${error.message}`);
  }
}

export async function addPatient(patient: Patient) {
  // 1. Save to Supabase Cloud
  const { error } = await supabase
    .from('patients')
    .insert([mapPatientToCloud(patient)]);

  if (error) {
    console.error('Supabase addPatient failed:', error.message);
    throw new Error(`Cloud storage error: ${error.message}`);
  }

  // 2. Local Cache
  try {
    const db = await getDb();
    if (db) {
      await db.runAsync(
        'INSERT INTO Patients (name, username, email, dob, password, nextAppointment, age, condition, status, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          patient.name,
          patient.username,
          patient.email,
          patient.dob,
          patient.password,
          patient.nextAppointment || 'Pending',
          patient.age || 30,
          patient.condition || 'General Checkup',
          patient.status || 'New',
          patient.timestamp || Date.now()
        ]
      );
    }
  } catch (err) {
    console.warn('SQLite local cache failed (Patients):', err);
  }
  return { success: true };
}

export async function getPatientByUsername(username: string): Promise<Patient | null> {
  // 1. Try Cloud
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('username', username)
    .single();
  
  if (!error && data) return mapCloudToPatient(data);

  // 2. Try Local
  try {
    const db = await getDb();
    if (db) {
      return await db.getFirstAsync('SELECT * FROM Patients WHERE username = ?', [username]) as Patient | null;
    }
  } catch (e) {
    console.warn('Local getPatientByUsername failed:', e);
  }
  return null;
}

export async function getPatientByEmail(email: string): Promise<Patient | null> {
  // 1. Try Cloud
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('email', email)
    .single();
  
  if (!error && data) return mapCloudToPatient(data);

  // 2. Try Local
  try {
    const db = await getDb();
    if (db) {
      return await db.getFirstAsync('SELECT * FROM Patients WHERE email = ?', [email]) as Patient | null;
    }
  } catch (e) {
    console.warn('Local getPatientByEmail failed:', e);
  }
  return null;
}

export async function updatePatientPassword(username: string, newPassword: string): Promise<void> {
  // 1. Sync to Cloud
  const { error } = await supabase
    .from('patients')
    .update({ password: newPassword })
    .eq('username', username);
  
  if (error) {
    console.error('Supabase updatePatientPassword failed:', error.message);
    throw new Error(`Cloud update failed: ${error.message}`);
  }

  // 2. Local Update
  try {
    const db = await getDb();
    if (db) {
      await db.runAsync('UPDATE Patients SET password = ? WHERE username = ?', [newPassword, username]);
    }
  } catch (e) {
    console.warn('Local updatePatientPassword failed:', e);
  }
}

export async function getAllPatients(): Promise<Patient[]> {
  // 1. Try fetching from Supabase
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .order('timestamp', { ascending: false });

  if (!error && data) {
    return data.map(mapCloudToPatient);
  }

  // 2. Local Fallback
  try {
    const db = await getDb();
    if (db) {
      return await db.getAllAsync('SELECT * FROM Patients ORDER BY timestamp DESC') as Patient[];
    }
  } catch (e) {
    console.warn('Local getAllPatients failed:', e);
  }
  return [];
}

export async function updatePatient(patient: Patient): Promise<void> {
  // 1. Sync to Cloud
  const { error } = await supabase
    .from('patients')
    .update(mapPatientToCloud(patient))
    .eq('username', patient.username);
  
  if (error) {
    console.error('Supabase updatePatient failed:', error.message);
    throw new Error(`Cloud update failed: ${error.message}`);
  }

  // 2. Local Update
  try {
    const db = await getDb();
    if (db) {
      await db.runAsync(
        'UPDATE Patients SET name = ?, email = ?, dob = ?, nextAppointment = ?, age = ?, condition = ?, status = ? WHERE username = ?',
        [
          patient.name,
          patient.email,
          patient.dob,
          patient.nextAppointment ?? null,
          patient.age ?? null,
          patient.condition ?? null,
          patient.status ?? null,
          patient.username
        ]
      );
    }
  } catch (e) {
    console.warn('Local updatePatient failed:', e);
  }
}

export async function updatePatientAppointment(username: string, nextAppointment: string): Promise<void> {
  // 1. Sync to Cloud
  const { error } = await supabase
    .from('patients')
    .update({ nextappointment: nextAppointment })
    .eq('username', username);
  
  if (error) {
    console.error('Supabase updatePatientAppointment failed:', error.message);
    throw new Error(`Cloud update failed: ${error.message}`);
  }

  // 2. Local Update
  try {
    const db = await getDb();
    if (db) {
      await db.runAsync(
        'UPDATE Patients SET nextAppointment = ? WHERE username = ?',
        [nextAppointment, username]
      );
    }
  } catch (e) {
    console.warn('Local updatePatientAppointment failed:', e);
  }
}

export async function getPatientHistory(patientUsername: string): Promise<PatientHistoryItem[]> {
  // 1. Try Cloud
  const { data, error } = await supabase
    .from('patienthistory')
    .select('*')
    .eq('patientusername', patientUsername)
    .order('date', { ascending: false });

  if (!error && data) {
    return data.map(mapCloudToHistory);
  }

  // 2. Local Fallback
  const db = await getDb();
  if (!db) return [];
  return await db.getAllAsync(
    'SELECT * FROM PatientHistory WHERE patientUsername = ? ORDER BY date DESC',
    [patientUsername]
  ) as PatientHistoryItem[];
}

export async function addPatientHistory(history: PatientHistoryItem) {
  // 1. Sync to Cloud
  await supabase
    .from('patienthistory')
    .insert([mapHistoryToCloud(history)]);

  // 2. Local Store
  try {
    const db = await getDb();
    if (db) {
      await db.runAsync(
        'INSERT INTO PatientHistory (patientUsername, date, event, details) VALUES (?, ?, ?, ?)',
        [history.patientUsername, history.date, history.event, history.details]
      );
    }
  } catch (err) {
    console.warn('SQLite local cache failed (History):', err);
  }
}

/**
 * Verifies Admin credentials against the Supabase 'admins' table.
 */
export async function verifyAdmin(username: string, password: string): Promise<boolean> {
  // Check the Doctors table in Supabase for matching credentials
  const { data, error } = await supabase
    .from('doctors')
    .select('id')
    .eq('username', username.trim().toLowerCase()) // Match lowercase username
    .eq('password', password) // Exact password match
    .single();

  if (error || !data) {
    console.warn('Admin/Doctor cloud verification failed:', error?.message);
    return false;
  }

  return true;
}




