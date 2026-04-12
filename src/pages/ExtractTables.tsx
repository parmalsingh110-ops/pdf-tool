import React from 'react';
import { FileCode } from 'lucide-react';
import GenericToolUI from '../components/GenericToolUI';

export default function ExtractTables() {
  const handleProcess = async () => new Promise<string>(r => setTimeout(() => r('#done'), 1500));
  return <GenericToolUI title="Extract Tables to CSV" description="Extract tables from your PDF and save them as CSV files." icon={FileCode} colorClass="text-emerald-500" bgClass="bg-emerald-50" actionText="Extract Tables" onProcess={handleProcess} requiresBackendAlert={true} outputExtension=".csv" />;
}
