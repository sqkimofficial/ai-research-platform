import React, { useState, useEffect } from 'react';
import { projectAPI } from '../../services/api';
import './ProjectSelector.css';

const ProjectSelector = ({ onSelectProject, onClose, isRequired = false }) => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await projectAPI.getAllProjects();
      setProjects(response.data.projects || []);
    } catch (err) {
      console.error('Failed to load projects:', err);
      setError('Failed to load projects. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProject = (project) => {
    onSelectProject(project.project_id, project.project_name);
  };

  const handleCreateProject = async (e) => {
    e.preventDefault();
    
    if (!newProjectName.trim()) {
      setError('Project name is required');
      return;
    }

    try {
      setCreating(true);
      setError('');
      const response = await projectAPI.createProject(
        newProjectName.trim(),
        newProjectDescription.trim() || null
      );
      
      const projectId = response.data.project_id;
      
      // Immediately select the newly created project
      onSelectProject(projectId, newProjectName.trim());
    } catch (err) {
      console.error('Failed to create project:', err);
      setError(err.response?.data?.error || 'Failed to create project. Please try again.');
      setCreating(false);
    }
  };

  const toggleCreateForm = () => {
    setShowCreateForm(!showCreateForm);
    setNewProjectName('');
    setNewProjectDescription('');
    setError('');
  };

  if (loading) {
    return (
      <div className="project-selector-overlay">
        <div className="project-selector-modal">
          <div className="loading-state">Loading projects...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="project-selector-overlay">
      <div className="project-selector-modal">
        <div className="project-selector-header">
          <h2>Select a Project</h2>
          {!isRequired && onClose && (
            <button className="close-button" onClick={onClose}>×</button>
          )}
        </div>

        {error && <div className="error-message">{error}</div>}

        {!showCreateForm ? (
          <>
            <div className="projects-list">
              {projects.length === 0 ? (
                <div className="empty-state">
                  <p>No projects yet. Create one to get started!</p>
                </div>
              ) : (
                projects.map((project) => (
                  <div
                    key={project.project_id}
                    className="project-item"
                    onClick={() => handleSelectProject(project)}
                  >
                    <div className="project-name">{project.project_name}</div>
                    {project.description && (
                      <div className="project-description">{project.description}</div>
                    )}
                  </div>
                ))
              )}
            </div>
            <div className="project-selector-actions">
              <button className="create-project-button" onClick={toggleCreateForm}>
                + Create New Project
              </button>
            </div>
          </>
        ) : (
          <div className="create-project-form">
            <h3>Create New Project</h3>
            <form onSubmit={handleCreateProject}>
              <div className="form-group">
                <label htmlFor="projectName">Project Name *</label>
                <input
                  id="projectName"
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Enter project name"
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="projectDescription">Description (Optional)</label>
                <textarea
                  id="projectDescription"
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder="Enter project description"
                  rows="3"
                />
              </div>
              <div className="form-actions">
                <button type="button" className="cancel-button" onClick={toggleCreateForm}>
                  Cancel
                </button>
                <button type="submit" className="submit-button" disabled={creating}>
                  {creating ? 'Creating...' : 'Create Project'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectSelector;

