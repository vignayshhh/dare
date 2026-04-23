"use client";

import { useState } from "react";
import { db } from "@/backend/lib/firebase";
import { collection, query, where, getDocs, deleteDoc } from "firebase/firestore";

export function ClearAlertsButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");

  const clearSakthiiiAlerts = async () => {
    setLoading(true);
    setResult("");
    
    try {
      console.log('🔄 Clearing alerts for sakthiii...');
      
      // sakthiii's user ID based on previous logs
      const userId = 'user_1772876886209_vlfcgglfn';
      
      // Get all alerts for sakthiii
      const alertsQuery = query(
        collection(db, 'alerts'),
        where('userId', '==', userId)
      );
      
      const querySnapshot = await getDocs(alertsQuery);
      console.log(`🔄 Found ${querySnapshot.docs.length} alerts for sakthiii`);
      
      // Delete each alert
      for (const docSnapshot of querySnapshot.docs) {
        console.log(`🗑️ Deleting alert: ${docSnapshot.id}`);
        await deleteDoc(docSnapshot.ref);
      }
      
      const message = `✅ Cleared ${querySnapshot.docs.length} alerts for sakthiii`;
      console.log(message);
      setResult(message);
      
    } catch (error) {
      const errorMessage = `❌ Error clearing alerts: ${error}`;
      console.error(errorMessage);
      setResult(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-red-900/20 border border-red-500 rounded-lg m-4">
      <h3 className="text-red-400 font-bold mb-2">⚠️ One-Time Alert Clear</h3>
      <p className="text-gray-300 text-sm mb-4">
        This will clear ALL alerts for sakthiii (user_1772876886209_vlfcgglfn). 
        This action cannot be undone.
      </p>
      
      <button
        onClick={clearSakthiiiAlerts}
        disabled={loading}
        className="bg-red-600 hover:bg-red-700 disabled:bg-red-800 text-white font-semibold py-2 px-4 rounded transition-colors"
      >
        {loading ? "Clearing..." : "Clear Sakthiii's Alerts"}
      </button>
      
      {result && (
        <div className={`mt-4 p-3 rounded text-sm ${result.includes('✅') ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
          {result}
        </div>
      )}
    </div>
  );
}
