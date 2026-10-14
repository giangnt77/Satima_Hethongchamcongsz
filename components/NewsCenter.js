'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/Toast';

function formatPublishedDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('vi-VN');
}

function articleContent(content, compact = false) {
  const parts = String(content || '').split(/(\[\[image:[A-Za-z0-9_-]+\]\])/g);
  return parts.map((part, index) => {
    const match = part.match(/^\[\[image:([A-Za-z0-9_-]+)\]\]$/);
    if (!match) return part;
    return (
      <img
        key={`image-${index}`}
        src={`https://drive.google.com/thumbnail?id=${encodeURIComponent(match[1])}&sz=w1600`}
        alt="Ảnh minh họa"
        loading="lazy"
        className={`my-3 h-auto max-w-full rounded-xl object-contain ${compact ? 'max-h-40' : 'max-h-[70vh]'}`}
      />
    );
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Không thể mở ảnh đã chọn.'));
    };
    image.src = objectUrl;
  });
}

function canvasToJpeg(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Trình duyệt không thể xử lý ảnh.'))),
      'image/jpeg',
      quality
    );
  });
}

async function prepareNewsImage(file) {
  const maxBytes = 3 * 1024 * 1024;
  const maxDimension = 1600;
  const image = await loadImage(file);
  if (file.size <= maxBytes && image.width <= maxDimension && image.height <= maxDimension) {
    return { file, resized: false };
  }

  let scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  while (true) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Trình duyệt không hỗ trợ xử lý ảnh.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.86, 0.78, 0.7, 0.62, 0.55]) {
      const blob = await canvasToJpeg(canvas, quality);
      if (blob.size <= maxBytes) {
        const resizedFile = new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'news-image'}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now(),
        });
        return { file: resizedFile, resized: true };
      }
    }

    if (Math.min(canvas.width, canvas.height) <= 640) {
      throw new Error('Không thể giảm ảnh xuống dưới 3 MB. Vui lòng chọn ảnh nhỏ hơn.');
    }
    scale *= 0.8;
  }
}

function formatFileSize(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function NewsCenter({ adminMode = false, onClose }) {
  const toast = useToast();
  const [articles, setArticles] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingStatus, setEditingStatus] = useState('draft');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const contentRef = useRef(null);
  const imageInputRef = useRef(null);
  const cursorPositionRef = useRef({ start: 0, end: 0 });

  const loadArticles = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('news_articles').select('*');
      if (!adminMode) query = query.eq('status', 'published');
      const { data, error } = await query
        .order('published_at', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message || 'Không thể tải bài viết.');
      setArticles(data || []);
    } catch (error) {
      toast.error('Lỗi tải Nội Quy', error.message || 'Không thể tải danh sách bài viết.');
    } finally {
      setLoading(false);
    }
  }, [adminMode, toast]);

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  const resetEditor = () => {
    setEditingId(null);
    setEditingStatus('draft');
    setTitle('');
    setContent('');
  };

  const startEditing = (article) => {
    setEditingId(article.id);
    setEditingStatus(article.status || 'draft');
    setTitle(article.title || '');
    setContent(article.content || '');
  };

  const rememberCursor = (event) => {
    cursorPositionRef.current = {
      start: event.currentTarget.selectionStart,
      end: event.currentTarget.selectionEnd,
    };
  };

  const uploadImage = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.warning('Định dạng ảnh không hỗ trợ', 'Chọn ảnh JPG, PNG hoặc WebP.');
      return;
    }
    setUploadingImage(true);
    try {
      const prepared = await prepareNewsImage(file);
      const uploadFile = prepared.file;
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || '');
          const separator = result.indexOf(',');
          if (separator < 0) {
            reject(new Error('Không thể đọc dữ liệu ảnh.'));
            return;
          }
          resolve(result.slice(separator + 1));
        };
        reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh.'));
        reader.readAsDataURL(uploadFile);
      });
      const { data, error } = await supabase.uploadNewsImage(base64, uploadFile.type);
      if (error) throw new Error(error.message || 'Không thể tải ảnh lên Google Drive.');
      if (!data?.fileId) throw new Error('Google Apps Script không trả về mã ảnh.');
      const marker = `[[image:${data.fileId}]]`;
      const current = contentRef.current?.value ?? content;
      const { start, end } = cursorPositionRef.current;
      const position = Math.min(start, current.length);
      const nextContent = `${current.slice(0, position)}${marker}${current.slice(Math.max(position, end))}`;
      setContent(nextContent);
      cursorPositionRef.current = { start: position + marker.length, end: position + marker.length };
      requestAnimationFrame(() => {
        const textarea = contentRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(position + marker.length, position + marker.length);
      });
      toast.success(
        prepared.resized ? 'Đã tự động giảm kích thước ảnh' : 'Đã chèn ảnh',
        prepared.resized
          ? `${formatFileSize(file.size)} → ${formatFileSize(uploadFile.size)}`
          : `${formatFileSize(uploadFile.size)} đã tải lên Drive.`
      );
    } catch (error) {
      toast.error('Không thể chèn ảnh', error.message || 'Tải ảnh lên Google Drive thất bại.');
    } finally {
      setUploadingImage(false);
    }
  };

  const saveArticle = async (status) => {
    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    if (!cleanTitle || !cleanContent) {
      toast.warning('Thiếu nội dung', 'Vui lòng nhập tiêu đề và nội dung bài viết.');
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const values = {
        title: cleanTitle,
        content: cleanContent,
        status,
        updated_at: now,
        published_at: status === 'published' ? now : '',
      };
      const request = editingId
        ? supabase.from('news_articles').update(values).eq('id', editingId)
        : supabase.from('news_articles').insert({
          ...values,
          id: `news_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          created_at: now,
        });
      const { error } = await request;
      if (error) throw new Error(error.message || 'Không thể lưu bài viết.');
      toast.success(status === 'published' ? 'Đã đăng bài' : 'Đã lưu bản nháp');
      resetEditor();
      await loadArticles();
    } catch (error) {
      toast.error('Không thể lưu bài viết', error.message);
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (article) => {
    const status = article.status === 'published' ? 'draft' : 'published';
    const now = new Date().toISOString();
    try {
      const { error } = await supabase
        .from('news_articles')
        .update({
          status,
          updated_at: now,
          published_at: status === 'published' ? now : '',
        })
        .eq('id', article.id);
      if (error) throw new Error(error.message || 'Không thể cập nhật trạng thái bài viết.');
      toast.success(status === 'published' ? 'Đã đăng bài' : 'Đã ẩn bài');
      await loadArticles();
    } catch (error) {
      toast.error('Không thể cập nhật bài viết', error.message);
    }
  };

  const removeArticle = async (article) => {
    if (!window.confirm(`Xóa bài "${article.title}"?`)) return;
    try {
      const { error } = await supabase.from('news_articles').delete().eq('id', article.id);
      if (error) throw new Error(error.message || 'Không thể xóa bài viết.');
      toast.success('Đã xóa bài viết');
      if (selectedArticle?.id === article.id) setSelectedArticle(null);
      if (editingId === article.id) resetEditor();
      await loadArticles();
    } catch (error) {
      toast.error('Không thể xóa bài viết', error.message);
    }
  };

  const embeddedImageIds = [...new Set(
    [...content.matchAll(/\[\[image:([A-Za-z0-9_-]+)\]\]/g)].map((match) => match[1])
  )];

  return (
    <div className={adminMode ? 'space-y-4' : 'fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-5 bg-black/70 backdrop-blur-xs'}>
      <section className={`w-full bg-white shadow-2xl overflow-hidden ${adminMode ? 'rounded-3xl border border-purple-200' : 'max-w-3xl max-h-[92vh] rounded-3xl flex flex-col'}`}>
        <header className="flex items-center justify-between gap-3 px-5 py-4 bg-purple-900 text-white">
          <div>
            <h2 className="font-black text-lg">{adminMode ? 'Quản Lý Nội Quy' : 'Nội Quy'}</h2>
            <p className="text-xs text-purple-100">Thông tin được cập nhật trực tiếp trên hệ thống</p>
          </div>
          <div className="flex items-center gap-2">
            {adminMode && (
              <button type="button" onClick={resetEditor} className="px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-xs font-black border-0 cursor-pointer">
                ➕ Bài mới
              </button>
            )}
            {onClose && (
              <button type="button" onClick={onClose} aria-label="Đóng" className="w-9 h-9 rounded-xl bg-white/15 hover:bg-white/25 text-white text-lg font-black border-0 cursor-pointer">
                ✕
              </button>
            )}
          </div>
        </header>

        <div className={adminMode ? 'grid lg:grid-cols-2 gap-4 p-4' : 'overflow-y-auto p-4 sm:p-5 space-y-4'}>
          {adminMode && (
            <form
              className="space-y-3 rounded-2xl border border-purple-200 bg-purple-50/60 p-4"
              onSubmit={(event) => {
                event.preventDefault();
                saveArticle(editingId ? editingStatus : 'draft');
              }}
            >
              <h3 className="font-black text-purple-950">{editingId ? 'Chỉnh sửa bài viết' : 'Soạn bài mới'}</h3>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={180}
                placeholder="Tiêu đề bài viết"
                aria-label="Tiêu đề bài viết"
                className="w-full rounded-xl border border-purple-200 bg-white px-3 py-2.5 text-sm font-bold text-purple-950 outline-none focus:border-purple-600"
              />
              <textarea
                ref={contentRef}
                value={content}
                onChange={(event) => setContent(event.target.value)}
                onClick={rememberCursor}
                onKeyUp={rememberCursor}
                onSelect={rememberCursor}
                rows={12}
                maxLength={30000}
                placeholder="Nhập nội dung nội quy hoặc thông báo..."
                aria-label="Nội dung bài viết"
                className="w-full resize-y rounded-xl border border-purple-200 bg-white px-3 py-2.5 text-sm text-purple-950 outline-none focus:border-purple-600"
              />
              {embeddedImageIds.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {embeddedImageIds.map((fileId) => (
                    <div key={fileId} className="relative rounded-xl border border-purple-200 bg-white p-1.5">
                      <img
                        src={`https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w320`}
                        alt="Ảnh đã chèn"
                        className="h-20 w-24 rounded-lg object-cover"
                      />
                      <button
                        type="button"
                        aria-label="Gỡ ảnh khỏi bài viết"
                        onClick={() => setContent((current) => current.split(`[[image:${fileId}]]`).join(''))}
                        className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-rose-600 text-white text-xs font-black border-0 cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={uploadImage}
                className="hidden"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={saving || uploadingImage}
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="px-4 py-2 rounded-xl bg-white text-purple-800 font-black text-xs border border-purple-200 cursor-pointer disabled:opacity-50"
                >
                  {uploadingImage ? 'Đang tải ảnh...' : '🖼️ Chèn ảnh'}
                </button>
                <button disabled={saving || uploadingImage} type="submit" className="px-4 py-2 rounded-xl bg-purple-100 text-purple-950 font-black text-xs border border-purple-200 cursor-pointer disabled:opacity-50">
                  {saving ? 'Đang lưu...' : editingId ? 'Lưu thay đổi' : 'Lưu bản nháp'}
                </button>
                <button disabled={saving || uploadingImage} type="button" onClick={() => saveArticle('published')} className="px-4 py-2 rounded-xl bg-purple-700 text-white font-black text-xs border-0 cursor-pointer disabled:opacity-50">
                  {saving ? 'Đang lưu...' : 'Đăng bài'}
                </button>
                {editingId && (
                  <button type="button" onClick={resetEditor} className="px-4 py-2 rounded-xl bg-white text-purple-800 font-bold text-xs border border-purple-200 cursor-pointer">
                    Hủy sửa
                  </button>
                )}
              </div>
            </form>
          )}

          <div className="space-y-3">
            {adminMode && <h3 className="font-black text-purple-950">Danh sách bài viết</h3>}
            {loading ? (
              <p className="py-8 text-center text-sm font-bold text-purple-600">Đang tải bài viết...</p>
            ) : articles.length === 0 ? (
              <p className="py-8 text-center text-sm font-bold text-purple-500">Chưa có bài viết nào được đăng.</p>
            ) : (
              articles.map((article) => (
                <article key={article.id} className="rounded-2xl border border-purple-200 bg-white p-4 shadow-sm">
                  <button type="button" onClick={() => setSelectedArticle(article)} className="w-full text-left bg-transparent border-0 p-0 cursor-pointer">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-black text-purple-950">{article.title}</h3>
                      {adminMode && (
                        <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-black ${article.status === 'published' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                          {article.status === 'published' ? 'ĐÃ ĐĂNG' : 'BẢN NHÁP'}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] font-bold text-purple-500">
                      {formatPublishedDate(article.published_at || article.created_at)}
                    </p>
                    <p className="mt-2 text-sm text-purple-900 whitespace-pre-wrap line-clamp-3">{articleContent(article.content, true)}</p>
                    <span className="mt-2 inline-block text-xs font-black text-purple-700">Mở bài viết →</span>
                  </button>
                  {adminMode && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-purple-100 pt-3">
                      <button type="button" onClick={() => startEditing(article)} className="rounded-lg bg-purple-50 px-3 py-1.5 text-xs font-black text-purple-800 border border-purple-200 cursor-pointer">
                        ✏️ Sửa
                      </button>
                      <button type="button" onClick={() => changeStatus(article)} className="rounded-lg bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-800 border border-amber-200 cursor-pointer">
                        {article.status === 'published' ? 'Ẩn bài' : 'Đăng bài'}
                      </button>
                      <button type="button" onClick={() => removeArticle(article)} className="rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-800 border border-rose-200 cursor-pointer">
                        Xóa
                      </button>
                    </div>
                  )}
                </article>
              ))
            )}
          </div>
        </div>
      </section>

      {selectedArticle && (
        <div className="fixed inset-0 z-[100000] flex items-center justify-center bg-black/70 p-3 sm:p-5" role="dialog" aria-modal="true">
          <article className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-5 sm:p-7 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-purple-100 pb-4">
              <div>
                <p className="text-xs font-black uppercase tracking-wide text-purple-600">Nội Quy</p>
                <h2 className="mt-1 text-xl font-black text-purple-950">{selectedArticle.title}</h2>
                <p className="mt-1 text-xs font-bold text-purple-500">
                  {formatPublishedDate(selectedArticle.published_at || selectedArticle.created_at)}
                </p>
              </div>
              <button type="button" onClick={() => setSelectedArticle(null)} aria-label="Đóng bài viết" className="w-9 h-9 shrink-0 rounded-xl bg-purple-100 text-purple-800 font-black border-0 cursor-pointer">✕</button>
            </div>
            <div className="pt-5 text-sm leading-7 text-purple-950 whitespace-pre-wrap break-words">{articleContent(selectedArticle.content)}</div>
          </article>
        </div>
      )}
    </div>
  );
}
