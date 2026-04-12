import React from 'react';
import { Search } from 'lucide-react';
import GenericToolUI from '../components/GenericToolUI';

export default function SearchReplace() {
  const handleProcess = async () => new Promise<string>(r => setTimeout(() => r('#done'), 1500));
  return <GenericToolUI title="Search & Replace" description="Search and replace text across your entire PDF." icon={Search} colorClass="text-blue-500" bgClass="bg-blue-50" actionText="Search and Replace" onProcess={handleProcess} requiresBackendAlert={true} />;
}
