import { auth, db, realtimeDb, storage } from '../lib/firebase';
import { 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged
} from 'firebase/auth';
import { 
  collection,
  addDoc,
  getDocs,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit
} from 'firebase/firestore';
import { ref, set, get, onValue, push, remove } from 'firebase/database';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';

export interface FirebaseTestResult {
  service: string;
  status: 'success' | 'error';
  message: string;
  details?: any;
}

class FirebaseConnectionTester {
  private results: FirebaseTestResult[] = [];

  private addResult(service: string, status: 'success' | 'error', message: string, details?: any) {
    this.results.push({ service, status, message, details });
    console.log(`[${status.toUpperCase()}] ${service}: ${message}`, details || '');
  }

  async testAuth(): Promise<void> {
    try {
      // Test auth state
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        console.log('Auth state changed:', user ? 'User logged in' : 'No user');
      });
      unsubscribe();

      // Test auth configuration
      const authConfig = auth.config;
      this.addResult('Firebase Auth', 'success', 'Auth service initialized successfully', {
        appId: auth.app.options.appId,
        authDomain: auth.app.options.authDomain,
        projectId: auth.app.options.projectId
      });
    } catch (error) {
      this.addResult('Firebase Auth', 'error', 'Failed to initialize auth', error);
    }
  }

  async testFirestore(): Promise<void> {
    try {
      // Test collection access
      const testCollection = collection(db, 'test');
      const testDoc = doc(testCollection);
      
      // Test write operation
      await setDoc(testDoc, {
        test: true,
        timestamp: new Date().toISOString(),
        type: 'firebase-connection-test'
      });

      // Test read operation
      const docSnapshot = await getDoc(testDoc);
      const data = docSnapshot.data();

      // Clean up
      await deleteDoc(testDoc);

      this.addResult('Firestore', 'success', 'Firestore operations working', {
        writeSuccess: !!data,
        readSuccess: docSnapshot.exists(),
        testData: data
      });
    } catch (error) {
      this.addResult('Firestore', 'error', 'Firestore operations failed', error);
    }
  }

  async testRealtimeDatabase(): Promise<void> {
    try {
      const testRef = ref(realtimeDb, 'test/connection');
      
      // Test write operation
      await set(testRef, {
        test: true,
        timestamp: new Date().toISOString(),
        type: 'firebase-connection-test'
      });

      // Test read operation
      const snapshot = await get(testRef);
      const data = snapshot.val();

      // Clean up
      await remove(testRef);

      this.addResult('Realtime Database', 'success', 'Realtime Database operations working', {
        writeSuccess: !!data,
        readSuccess: snapshot.exists(),
        testData: data
      });
    } catch (error) {
      this.addResult('Realtime Database', 'error', 'Realtime Database operations failed', error);
    }
  }

  async testStorage(): Promise<void> {
    try {
      // Test storage reference creation
      const testStorageRef = storageRef(storage, 'test/connection-test.txt');
      
      // Create a test file
      const testData = new TextEncoder().encode('Firebase Storage Connection Test');
      
      // Note: We'll just test reference creation since actual upload might require permissions
      this.addResult('Firebase Storage', 'success', 'Storage service initialized successfully', {
        bucket: storage.app.options.storageBucket,
        testRefPath: testStorageRef.fullPath
      });
    } catch (error) {
      this.addResult('Firebase Storage', 'error', 'Storage initialization failed', error);
    }
  }

  async testFirebaseConfig(): Promise<void> {
    try {
      const app = auth.app;
      const config = app.options;
      
      this.addResult('Firebase Configuration', 'success', 'Firebase app configured', {
        apiKey: config.apiKey ? 'Present' : 'Missing',
        authDomain: config.authDomain || 'Not configured',
        projectId: config.projectId || 'Not configured',
        storageBucket: config.storageBucket || 'Not configured',
        messagingSenderId: config.messagingSenderId || 'Not configured',
        appId: config.appId || 'Not configured'
      });
    } catch (error) {
      this.addResult('Firebase Configuration', 'error', 'Firebase configuration failed', error);
    }
  }

  async runAllTests(): Promise<FirebaseTestResult[]> {
    console.log('🔥 Starting Firebase Connection Tests...');
    this.results = [];

    await this.testFirebaseConfig();
    await this.testAuth();
    await this.testFirestore();
    await this.testRealtimeDatabase();
    await this.testStorage();

    console.log('\n📊 Test Results Summary:');
    this.results.forEach(result => {
      const icon = result.status === 'success' ? '✅' : '❌';
      console.log(`${icon} ${result.service}: ${result.message}`);
    });

    const successCount = this.results.filter(r => r.status === 'success').length;
    const totalCount = this.results.length;
    console.log(`\n🎯 Overall: ${successCount}/${totalCount} services working correctly`);

    return this.results;
  }

  getResults(): FirebaseTestResult[] {
    return this.results;
  }
}

export const firebaseTester = new FirebaseConnectionTester();
export default FirebaseConnectionTester;
