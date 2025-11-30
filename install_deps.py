#!/usr/bin/env python
# -*- coding: utf-8 -*-
import subprocess
import sys
import os

def install_backend():
    print("Setting up backend virtual environment...")
    cwd = os.getcwd()
    backend_dir = os.path.join(cwd, "backend")
    venv_dir = os.path.join(backend_dir, "venv")
    
    if not os.path.exists(venv_dir):
        subprocess.run([sys.executable, "-m", "venv", venv_dir], check=True)
    
    pip_exe = os.path.join(venv_dir, "Scripts", "pip.exe")
    requirements = os.path.join(backend_dir, "requirements.txt")
    
    print("Installing backend dependencies...")
    # Use shell=True to bypass path encoding issues
    subprocess.run(f'"{pip_exe}" install -r "{requirements}"', shell=True, check=True)
    print("Backend dependencies installed!")

def install_frontend():
    print("Installing frontend dependencies...")
    cwd = os.getcwd()
    frontend_dir = os.path.join(cwd, "frontend")
    # Use shell=True to bypass path encoding issues
    subprocess.run(f'cd /d "{frontend_dir}" && npm install', shell=True, check=True)
    print("Frontend dependencies installed!")

if __name__ == "__main__":
    try:
        install_backend()
        install_frontend()
        print("\nAll dependencies installed successfully!")
    except subprocess.CalledProcessError as e:
        print(f"Error: {e}")
        sys.exit(1)
    except FileNotFoundError as e:
        print(f"Error: {e}")
        print("Make sure Python and npm are installed and in your PATH")
        sys.exit(1)

