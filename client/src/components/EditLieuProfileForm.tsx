import React, { useState, type CSSProperties, useEffect } from 'react';
import type { IUserData } from '../types/user';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useAlert } from '../hooks/useAlert';
import { getErrorMessage, ErrorMessages, SuccessMessages, WarningMessages } from '../services/systemMessages';

interface EditLieuProfileFormProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: IUserData;
  onSaveSuccess: () => void;
  scrollToField?: string;
}

type LieuFormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  avatarUrl: string | null;
};

function EditLieuProfileForm({ isOpen, onClose, currentUser, onSaveSuccess, scrollToField }: EditLieuProfileFormProps) {
  const { isLoading } = useAuth();
  const { showSuccess, showError, showWarning } = useAlert();
  const [formData, setFormData] = useState<LieuFormData>({
    firstName: currentUser.firstName || '',
    lastName: currentUser.lastName || '',
    email: currentUser.email || '',
    phone: currentUser.phone || '',
    city: currentUser.city || '',
    address: currentUser.address || '',
    avatarUrl: currentUser.avatarUrl || null,
  });
  const [previewImage, setPreviewImage] = useState<string | null>(currentUser?.avatarUrl || null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [avatarChanged, setAvatarChanged] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setFormData({
        firstName: currentUser.firstName || '',
        lastName: currentUser.lastName || '',
        email: currentUser.email || '',
        phone: currentUser.phone || '',
        city: currentUser.city || '',
        address: currentUser.address || '',
        avatarUrl: currentUser.avatarUrl || null,
      });
      setPreviewImage(currentUser.avatarUrl || null);
      setAvatarRemoved(false);
      setAvatarChanged(false);
    }
  }, [currentUser]);

  useEffect(() => {
    if (isOpen && scrollToField) {
      setTimeout(() => {
        const el = document.getElementById(scrollToField);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }, [isOpen, scrollToField]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showWarning(WarningMessages.IMAGE_TOO_LARGE);
      return;
    }
    if (!file.type.startsWith('image/')) {
      showWarning(WarningMessages.IMAGE_REQUIRED);
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      setPreviewImage(base64String);
      setFormData(prev => ({ ...prev, avatarUrl: base64String }));
      setAvatarRemoved(false);
      setAvatarChanged(true);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveAvatar = () => {
    setPreviewImage(null);
    setFormData(prev => ({ ...prev, avatarUrl: null }));
    setAvatarRemoved(true);
    setAvatarChanged(true);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    if (!(currentUser?.id || currentUser?._id)) {
      showWarning(WarningMessages.AUTH_REQUIRED_PROFILE_EDIT);
      return;
    }
    try {
      const updatedData: any = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        phone: formData.phone,
        city: formData.city,
        address: formData.address,
      };
      if (avatarChanged) {
        updatedData.avatarUrl = avatarRemoved ? null : formData.avatarUrl;
      }
      const userId = currentUser.id || currentUser._id;
      await api.put(`/profile/${userId}`, updatedData);
      showSuccess(SuccessMessages.PROFILE_UPDATED);
      onSaveSuccess();
      onClose();
    } catch (error: any) {
      showError(getErrorMessage(error, ErrorMessages.PROFILE_UPDATE_FAILED));
    }
  };

  if (!isOpen) return null;
  if (isLoading || !currentUser) {
    return <div style={{ color: '#fff', textAlign: 'center', marginTop: 40 }}>Chargement du profil...</div>;
  }

  const formContainerStyle: CSSProperties = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#1a1a2e',
    padding: '30px',
    borderRadius: '10px',
    boxShadow: '0 5px 15px rgba(0, 0, 0, 0.5)',
    width: '90%',
    maxWidth: '700px',
    zIndex: 2000,
    color: '#ffffff',
    maxHeight: '90vh',
    overflowY: 'auto',
    border: '1px solid rgba(255, 255, 255, 0.1)',
  };

  const overlayStyle: CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 1999,
  };

  const titleStyle: CSSProperties = {
    fontSize: '2em',
    color: '#ff416c',
    marginBottom: '20px',
    textAlign: 'center',
  };

  const inputGroupStyle: CSSProperties = { marginBottom: '15px' };

  const labelStyle: CSSProperties = {
    display: 'block',
    marginBottom: '5px',
    fontWeight: 'bold',
    color: '#ff4b2b',
  };

  const inputStyle: CSSProperties = {
    width: '100%',
    padding: '10px',
    borderRadius: '5px',
    border: '1px solid #555',
    backgroundColor: '#333',
    color: '#ffffff',
    boxSizing: 'border-box',
  };

  const twoColumnLayout: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '15px',
    marginBottom: '15px',
  };

  const buttonContainerStyle: CSSProperties = {
    marginTop: '30px',
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '15px',
  };

  const primaryButtonStyle: CSSProperties = {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(to right, #28a745, #218838)',
    color: 'white',
    fontSize: '1em',
    fontWeight: 'bold',
    cursor: 'pointer',
  };

  const secondaryButtonStyle: CSSProperties = {
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(to right, #dc3545, #c82333)',
    color: 'white',
    fontSize: '1em',
    fontWeight: 'bold',
    cursor: 'pointer',
  };

  const closeButtonStyle: CSSProperties = {
    position: 'absolute',
    top: '15px',
    right: '15px',
    background: 'none',
    border: 'none',
    fontSize: '1.5em',
    cursor: 'pointer',
    color: '#ffffff',
  };

  return (
    <div style={overlayStyle}>
      <div style={formContainerStyle}>
        <button onClick={onClose} style={closeButtonStyle}>&times;</button>
        <h2 style={titleStyle}>Modifier le Profil Lieu</h2>
        <form onSubmit={handleSubmit}>
          {/* Photo de profil */}
          <h3 style={{ color: '#ff4b2b', marginBottom: '15px' }}>Photo de profil</h3>
          {previewImage && (
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
              <img
                src={previewImage}
                alt="Aperçu"
                style={{ width: '100px', height: '100px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #ff416c' }}
              />
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <label style={{
              padding: '8px 16px',
              background: 'linear-gradient(to right, #ff416c, #ff4b2b)',
              color: 'white',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '0.9em',
            }}>
              Choisir une image
              <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
            </label>
            {previewImage && (
              <button type="button" onClick={handleRemoveAvatar} style={secondaryButtonStyle}>
                Supprimer la photo
              </button>
            )}
          </div>

          {/* Informations */}
          <h3 style={{ color: '#ff4b2b', marginBottom: '15px' }}>Informations personnelles</h3>
          <div style={twoColumnLayout}>
            <div style={inputGroupStyle} id="firstName">
              <label style={labelStyle} htmlFor="firstName">Prénom</label>
              <input id="firstName" style={inputStyle} value={formData.firstName} onChange={handleChange} />
            </div>
            <div style={inputGroupStyle} id="lastName">
              <label style={labelStyle} htmlFor="lastName">Nom</label>
              <input id="lastName" style={inputStyle} value={formData.lastName} onChange={handleChange} />
            </div>
          </div>
          <div style={inputGroupStyle} id="email">
            <label style={labelStyle} htmlFor="email">Email</label>
            <input id="email" type="email" style={inputStyle} value={formData.email} onChange={handleChange} />
          </div>
          <div style={inputGroupStyle} id="phone">
            <label style={labelStyle} htmlFor="phone">Téléphone</label>
            <input id="phone" style={inputStyle} value={formData.phone} onChange={handleChange} />
          </div>
          <div style={inputGroupStyle} id="city">
            <label style={labelStyle} htmlFor="city">Ville</label>
            <input id="city" style={inputStyle} value={formData.city} onChange={handleChange} />
          </div>
          <div style={inputGroupStyle} id="address">
            <label style={labelStyle} htmlFor="address">Adresse</label>
            <input id="address" style={inputStyle} value={formData.address} onChange={handleChange} />
          </div>

          <div style={buttonContainerStyle}>
            <button type="button" onClick={onClose} style={secondaryButtonStyle}>Annuler</button>
            <button type="submit" style={primaryButtonStyle}>Enregistrer</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default EditLieuProfileForm;
