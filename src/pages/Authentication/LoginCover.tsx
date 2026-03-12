import React, { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { setPageTitle } from '../../store/themeConfigSlice';
import logo from '../../images/mklogo.png';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import Swal from 'sweetalert2';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_REACT_APP_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const LoginCover = () => {
    const dispatch = useDispatch();
    useEffect(() => {
        dispatch(setPageTitle('POS Management Login'));
    });

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [passwordVisible, setPasswordVisible] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const navigateToPage = () => {
        navigate('/dashboard');
    };

    const handleLogin = async () => {
        setIsLoading(true);

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) {
                Swal.fire({
                    title: 'Login Failed',
                    text: error.message,
                    icon: 'error',
                    confirmButtonText: 'Try Again',
                    confirmButtonColor: '#0800b0',
                });
            } else {
                // Store user data in localStorage
                localStorage.setItem('user', JSON.stringify(data.user));

                // Navigate to Dashboard
                navigateToPage();
            }
        } catch (err) {
            console.error('Login Error:', err);
            Swal.fire({
                title: 'Error',
                text: 'Something went wrong. Please try again later.',
                icon: 'error',
                confirmButtonText: 'OK',
                confirmButtonColor: '#0800b0',
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div
            className="flex items-center justify-center min-h-screen bg-gray-100 p-3"
            style={{
                backgroundImage: 'radial-gradient(circle, #000 -2px, transparent 2px)',
                backgroundSize: '20px 20px',
            }}
        >
            <div className="w-full max-w-md bg-white shadow-lg rounded-lg p-6">
                {/* Logo */}
                <div className="flex justify-center mb-6">
                    <img src={logo} alt="Logo" className="w-16 sm:w-20" />
                </div>

                {/* Header */}
                <h2 className="text-lg font-bold text-gray-800 text-center mb-2">MOJHOA AUTOMATIONS POS MANAGEMENT SYSTEM</h2>
                <p className="text-sm text-gray-600 text-center mb-4">Please login with your company information.</p>

                {/* Form */}
                <form className="space-y-4">
                    <div>
                        <input
                            type="email"
                            placeholder="Email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring focus:ring-blue-200 text-gray-700"
                        />
                    </div>
                    <div className="relative">
                        <input
                            type={passwordVisible ? 'text' : 'password'}
                            placeholder="Password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring focus:ring-blue-200 text-gray-700"
                        />
                        <button
                            type="button"
                            onClick={() => setPasswordVisible(!passwordVisible)}
                            className="absolute inset-y-0 right-3 flex items-center text-gray-600"
                        >
                            {passwordVisible ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                        </button>
                    </div>

                    {/* Login Button */}
                    <button
                        type="button"
                        disabled={isLoading}
                        onClick={handleLogin}
                        className={`w-full py-2 text-white font-semibold rounded-lg shadow-md focus:outline-none focus:ring focus:ring-blue-200 ${
                            isLoading ? 'bg-gray-400' : 'bg-[#05006a] hover:bg-[#0800b0]'
                        }`}
                    >
                        {isLoading ? (
                            <span className="flex items-center justify-center">
                                <svg
                                    className="animate-spin h-5 w-5 mr-3 text-white"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                    ></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                                </svg>
                                Loading...
                            </span>
                        ) : (
                            'Login Now'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LoginCover;
