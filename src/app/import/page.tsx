"use client";

import { useState} from"react";
import { useMutation} from"convex/react";
import { api} from"@/convex/_generated/api";

type ImportType ="drivers" |"trucks" |"trailers";

export default function ImportPage() {
 const [activeTab, setActiveTab] = useState<ImportType>("drivers");
 const [jsonInput, setJsonInput] = useState("");
 const [status, setStatus] = useState<{ type:"success" |"error" |"info"; message: string} | null>(null);
 const [isProcessing, setIsProcessing] = useState(false);

 const importDrivers = useMutation(api.dataImport.importDrivers);
 const importTrucks = useMutation(api.dataImport.importTrucks);
 const importTrailers = useMutation(api.dataImport.importTrailers);

 const handleImport = async () => {
 if (!jsonInput.trim()) {
 setStatus({ type:"error", message:"Please paste JSON content first."});
 return;
}

 setIsProcessing(true);
 setStatus({ type:"info", message:"Processing..."});

 try {
 const data = JSON.parse(jsonInput);
 
 if (!Array.isArray(data)) {
 throw new Error("Input must be a JSON array.");
}

 let resultMessage ="";

 if (activeTab ==="drivers") {
 resultMessage = await importDrivers({ drivers: data});
} else if (activeTab ==="trucks") {
 resultMessage = await importTrucks({ trucks: data});
} else if (activeTab ==="trailers") {
 resultMessage = await importTrailers({ trailers: data});
}

 setStatus({ type:"success", message: resultMessage});
 setJsonInput(""); // Clear input on success
} catch (err: any) {
 console.error(err);
 setStatus({ 
 type:"error", 
 message:`Import failed: ${err.message ||"Unknown error"}` 
});
} finally {
 setIsProcessing(false);
}
};

 const getExampleJson = (type: ImportType) => {
 switch (type) {
 case"drivers":
 return`[
 {
"driverId":"D001",
"driverName":"John Doe",
"idNumber":"1234567890123",
"phone":"0821234567",
"status":"active"
}
]`;
 case"trucks":
 return`[
 {
"truckFleetNo":"T001",
"registration":"AB 12 CD GP",
"make":"Volvo",
"model":"FH16"
}
]`;
 case"trailers":
 return`[
 {
"trailerFleetNo": 101,
"type":"Flatbed",
"trailerFleetNoStr":"101",
"trailers": [
 {"length":"12m","registration":"TR 99 AA GP"}
]
}
]`;
}
};

 const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
 const file = e.target.files?.[0];
 if (!file) return;

 const reader = new FileReader();
 reader.onload = (event) => {
 const content = event.target?.result as string;
 setJsonInput(content);
 setStatus({ type:"info", message:`Loaded file: ${file.name}`});
};
 reader.onerror = () => {
 setStatus({ type:"error", message:"Error reading file."});
};
 reader.readAsText(file);
};

 return (
 <div className="p-8 space-y-6" style={{color:"var(--foreground)"}}>
 <div className="flex justify-between items-center">
 <h1 className="text-2xl font-black tracking-tight" style={{color:"var(--foreground)"}}>Data Import</h1>
 </div>

 <div className="glass-card-premium p-6">
 {/* Tabs */}
 <div className="flex mb-6" style={{borderBottom:"1px solid var(--card-border)"}}>
 {(["drivers","trucks","trailers"] as ImportType[]).map((tab) => (
 <button
 key={tab}
 onClick={() => {
 setActiveTab(tab);
 setStatus(null);
 setJsonInput("");
}}
 className={`px-6 py-3 text-sm font-semibold transition-all ${
 activeTab === tab
 ?"text-[#06B6D4] border-b-2 border-[#06B6D4]"
 :""
}`}
 style={{color: activeTab === tab ? undefined :"var(--nav-text-color)"}}
 >
 {tab.charAt(0).toUpperCase() + tab.slice(1)}
 </button>
))}
 </div>

 <div className="space-y-4">
 <div className="flex justify-between items-center">
 <label className="block text-sm font-medium" style={{color:"var(--nav-text-color)"}}>
 Upload JSON File or Paste Content
 </label>
 <button 
 onClick={() => setJsonInput(getExampleJson(activeTab))}
 className="text-xs" style={{color:"var(--color-primary)"}}
 >
 Load Example
 </button>
 </div>

 <div className="flex items-center gap-4 p-4 glass-card rounded-lg border-dashed">
 <input
 type="file"
 accept=".json"
 onChange={handleFileUpload}
 className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-gradient-to-br file:from-[#06B6D4] file:to-[#0891B2] file:text-white hover:file:opacity-90 cursor-pointer"
 style={{color:"var(--nav-text-color)"}}
 />
 </div>
 
 <textarea
 value={jsonInput}
 onChange={(e) => setJsonInput(e.target.value)}
 rows={15}
 className="w-full font-mono text-sm p-4 rounded-lg outline-none transition-all"
 style={{
 border:"1px solid var(--card-border)",
 background:"var(--card-bg)",
 color:"var(--foreground)",
 backdropFilter:"blur(8px)",
}}
 placeholder={`[\n ...\n]`}
 />

 {status && (
 <div className={`p-4 rounded-lg text-sm ${
 status.type ==="success"
 ?"bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
 : status.type ==="error"
 ?"bg-red-500/10 text-red-600 dark:text-red-400"
 :"bg-blue-500/10 text-blue-600 dark:text-blue-400"
}`}>
 {status.message}
 </div>
)}

 <div className="flex justify-end pt-4">
 <button
 onClick={handleImport}
 disabled={isProcessing}
 className="px-6 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-br from-[#06B6D4] to-[#0891B2] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
 >
 {isProcessing ?"Importing..." :"Import Data"}
 </button>
 </div>
 </div>
 </div>
 </div>
);
}
