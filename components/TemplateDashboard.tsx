import React, { useState, useEffect, useRef } from 'react';
import { Plus, Play, Trash2, ArrowLeftRight, Loader2, Gamepad2, Download, Upload, Edit } from 'lucide-react';
import { dataService } from '../services/dataService';
import { Show, GameTemplate } from '../types';
import { TemplateBuilder } from './TemplateBuilder';
import { soundService } from '../services/soundService';

interface Props {
  show: Show;
  onSwitchShow: () => void;
  onPlayTemplate: (template: GameTemplate) => void;
  addToast: (type: any, msg: string) => void;
  onLogout?: () => void;
}

export const TemplateDashboard: React.FC<Props> = ({ show, onSwitchShow, onPlayTemplate, addToast, onLogout }) => {
  const [templates, setTemplates] = useState<GameTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<GameTemplate | null | undefined>(undefined); // undefined = closed, null = new, object = edit
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadTemplates();
  }, [show.id]);

  const loadTemplates = () => {
    setTemplates(dataService.getTemplatesForShow(show.id));
  };

  // --- ACTIONS ---

  const handleCreateNew = () => {
    soundService.playClick();
    if (templates.length >= 40) {
      addToast('error', 'Limit reached (40 templates).');
      return;
    }
    setEditingTemplate(null); // Open builder in 'new' mode
  };

  const handleEdit = (t: GameTemplate) => {
    soundService.playClick();
    setEditingTemplate(t);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    soundService.playClick();
    if (confirm('Delete this template permanently?')) {
      dataService.deleteTemplate(id);
      loadTemplates();
      addToast('info', 'Template deleted.');
    }
  };

  const handleDownload = (e: React.MouseEvent, t: GameTemplate) => {
    e.stopPropagation();
    soundService.playClick();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(t, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `${t.topic.replace(/\s+/g, '_')}_template.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  const handleUploadClick = () => {
    soundService.playClick();
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        dataService.importTemplate(show.id, content);
        loadTemplates();
        addToast('success', 'Template imported successfully.');
      } catch (err: any) {
        addToast('error', `Import failed: ${err.message}`);
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = ''; // Reset
      }
    };
    reader.readAsText(file);
  };

  // --- RENDER ---

  if (editingTemplate !== undefined) {
    return (
      <TemplateBuilder 
        showId={show.id}
        initialTemplate={editingTemplate}
        onClose={() => { soundService.playClick(); setEditingTemplate(undefined); }}
        onSave={() => {
          setEditingTemplate(undefined);
          loadTemplates();
        }}
        onLogout={onLogout}
        addToast={addToast}
      />
    );
  }

  return (
    <div className="h-full flex flex-col p-4 md:p-8 max-w-7xl mx-auto w-full">
      {/* Dashboard Header */}
      <div className="flex flex-col md:flex-row justify-between items-center mb-8 border-b border-zinc-800 pb-4 gap-4">
        <div>
          <p className="text-[10px] text-gold-500 font-bold uppercase tracking-widest mb-1">Step 2 of 3</p>
          <h2 className="text-2xl font-serif text-white">Template Library</h2>
          <p className="text-zinc-500 text-xs uppercase tracking-wider mt-1">
            {templates.length} / 40 Slots Used
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <input 
             type="file" 
             ref={fileInputRef} 
             onChange={handleFileChange} 
             accept=".json" 
             className="hidden" 
          />
          <button 
             onClick={handleUploadClick}
             className="text-gold-500 border border-gold-900/50 hover:bg-gold-900/20 px-3 py-2 rounded flex items-center gap-2 text-xs uppercase font-bold"
          >
            <Upload className="w-3 h-3" /> Import
          </button>
          <button 
            onClick={() => { soundService.playClick(); onSwitchShow(); }}
            className="text-zinc-400 hover:text-white flex items-center gap-2 text-xs uppercase font-bold border border-zinc-800 hover:border-zinc-600 px-4 py-2 rounded transition-all"
          >
            <ArrowLeftRight className="w-3 h-3" /> Switch Show
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pb-20 content-start custom-scrollbar">
        
        {/* New Template Card */}
        <button 
          onClick={handleCreateNew}
          className="bg-zinc-900/50 border border-gold-900/30 hover:bg-gold-900/10 hover:border-gold-500/50 rounded p-6 flex flex-col items-center justify-center text-gold-500 transition-all group h-48"
        >
          <div className="bg-black p-3 rounded-full mb-3 group-hover:scale-110 transition-transform">
            <Plus className="w-6 h-6" />
          </div>
          <span className="font-bold uppercase tracking-wider text-sm">Create Template</span>
        </button>

        {/* Existing Templates */}
        {templates.map(t => (
          <div 
            key={t.id}
            className="bg-black border border-zinc-800 hover:border-zinc-600 p-4 rounded group relative flex flex-col h-48 transition-all hover:-translate-y-1 hover:shadow-lg"
          >
            <div className="flex justify-between items-start mb-2">
              <Gamepad2 className="w-5 h-5 text-zinc-700" />
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                 <button onClick={(e) => handleEdit(t)} className="p-1.5 bg-zinc-800 hover:bg-gold-600 hover:text-black text-zinc-400 rounded" title="Edit"><Edit className="w-3 h-3" /></button>
                 <button onClick={(e) => handleDownload(e, t)} className="p-1.5 bg-zinc-800 hover:bg-blue-600 hover:text-white text-zinc-400 rounded" title="Download"><Download className="w-3 h-3" /></button>
                 <button onClick={(e) => handleDelete(e, t.id)} className="p-1.5 bg-zinc-800 hover:bg-red-600 hover:text-white text-zinc-400 rounded" title="Delete"><Trash2 className="w-3 h-3" /></button>
              </div>
            </div>
            
            <div className="flex-1">
              <h4 className="text-white font-bold line-clamp-2 leading-tight text-lg mb-1">{t.topic}</h4>
              <div className="flex flex-wrap gap-1">
                <span className="text-[10px] bg-zinc-900 text-zinc-500 px-1 rounded">{t.config?.categoryCount || 4} Cats</span>
                <span className="text-[10px] bg-zinc-900 text-zinc-500 px-1 rounded">{t.config?.rowCount || 5} Rows</span>
              </div>
            </div>

            <button 
               onClick={() => { soundService.playSelect(); onPlayTemplate(t); }}
               className="w-full mt-2 bg-zinc-900 hover:bg-gold-600 hover:text-black text-gold-500 font-bold py-2 rounded text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-colors"
            >
              <Play className="w-3 h-3" /> Play Show
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};