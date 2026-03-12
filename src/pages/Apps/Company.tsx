import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { setPageTitle } from '../../store/themeConfigSlice';
import Swal from 'sweetalert2';
import { createClient } from '@supabase/supabase-js';
import IconPencilPaper from '../../components/Icon/IconPencilPaper';

const supabaseUrl = import.meta.env.VITE_REACT_APP_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_REACT_APP_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const Company = () => {
    const dispatch = useDispatch();

    useEffect(() => {
        dispatch(setPageTitle('Account Setting'));
    }, [dispatch]);

    const [loading, setLoading] = useState(false);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [company, setCompany] = useState<any>(null);

    const [companyName, setCompanyName] = useState('');
    const [companyPhone, setCompanyPhone] = useState('');
    const [companyAddress, setCompanyAddress] = useState('');
    const [companyManager, setCompanyManager] = useState('');
    const [companyMpin, setCompanyMpin] = useState('');
    const [businessRegNumber, setBusinessRegNumber] = useState('');
    const [vatNumber, setVatNumber] = useState('');
    const [image, setImage] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string>('');

    // ✅ Fetch authenticated user
    useEffect(() => {
        const fetchUser = async () => {
            const { data, error } = await supabase.auth.getUser();
            if (error) {
                console.error('Error fetching user:', error);
                return;
            }
            setUserEmail(data?.user?.email || null);
        };

        fetchUser();
    }, []);

    useEffect(() => {
        if (!userEmail) return;

        const fetchCompanyDetails = async () => {
            setLoading(true);
            Swal.fire({
                title: 'Fetching Company details...',
                text: 'Please wait while we load your details.',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                },
            });
            const { data, error } = await supabase.from('companies').select('*').eq('company_email', userEmail).single();
            Swal.close();

            if (error) {
                console.log('No company found, user can add details.');
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Failed to fetch details. Please try again later.',
                    confirmButtonText: 'OK',
                });
                setLoading(false);
                return;
            }

            // ✅ Pre-fill details if company exists
            setCompany(data);
            setCompanyName(data.company_username);
            setCompanyPhone(data.phone_number);
            setCompanyAddress(data.address);
            setCompanyManager(data.manager);
            setCompanyMpin(data.mpin);
            setBusinessRegNumber(data.brn || '');
            setVatNumber(data.vat || '');
            setImagePreview(data.company_logo || ''); // ✅ Load Base64 logo
            setLoading(false);
        };

        fetchCompanyDetails();
    }, [userEmail]);

    const updateUserDetails = async () => {
        setLoading(true);
        const missingFields = [];
        if (!companyName.trim()) missingFields.push('Company Name');
        if (!companyPhone.trim()) missingFields.push('Phone Number');
        if (!companyAddress.trim()) missingFields.push('Address');
        if (!companyManager.trim()) missingFields.push('Manager');
        if (!imagePreview) missingFields.push('Company Logo');

        if (missingFields.length > 0) {
            setLoading(false);
            Swal.fire({
                icon: 'warning',
                title: 'Missing Fields',
                html: `Please fill the following fields:<br><strong>${missingFields.join(', ')}</strong>`,
                confirmButtonText: 'OK',
            });
            return;
        }

        let logoBase64 = imagePreview; // Use existing Base64 if no new upload

        if (image) {
            try {
                logoBase64 = await convertFileToBase64(image); // Convert new image to Base64
            } catch (error) {
                console.error('Error converting image to Base64:', error);
                Swal.fire('Error', 'Failed to process image.', 'error');
                setLoading(false);
                return;
            }
        }

        const companyData = {
            company_username: companyName,
            company_email: userEmail,
            phone_number: companyPhone,
            address: companyAddress,
            manager: companyManager,
            mpin: '',
            brn: businessRegNumber || null,
            vat: vatNumber || null,
            company_logo: logoBase64, // ✅ Store Base64 string instead of blob
        };

        try {
            if (company) {
                // ✅ Update existing company details
                const { error } = await supabase.from('companies').update(companyData).eq('company_email', userEmail);

                if (error) throw error;
                Swal.fire('Success', 'Company details updated!', 'success');
            } else {
                // ✅ Insert new company details
                const { error } = await supabase.from('companies').insert([companyData]);

                if (error) throw error;
                Swal.fire('Success', 'Company details saved!', 'success');
            }

            setCompany(companyData); // ✅ Update UI with new company data
            setImagePreview(logoBase64); // ✅ Set new image preview
        } catch (error) {
            console.error('Error saving details:', error);
            Swal.fire('Error', 'Failed to save details.', 'error');
        }

        setLoading(false);
    };

    const convertFileToBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = (error) => reject(error);
        });
    };

    return (
        <div className="pt-5">
            <form className="border border-[#ebedf2] dark:border-[#191e3a] rounded-md p-4 mb-5 bg-white dark:bg-black">
                <h6 className="text-lg font-bold mb-5">Company Information</h6>
                <div className="flex flex-col sm:flex-row">
                    <div className="relative w-full sm:w-2/12 mb-5 flex flex-col items-center">
                        {/* Profile Image */}
                        <label htmlFor="imageUpload" className="cursor-pointer block relative">
                            <img
                                src={imagePreview || '/assets/images/default-company.png'} // ✅ Display Base64 image
                                alt="Company Logo"
                                className="w-20 h-20 md:w-32 md:h-32 rounded-full object-cover mx-auto border-2 border-gray-400"
                            />
                        </label>

                        {/* Edit Icon */}
                        <label
                            htmlFor="imageUpload"
                            className="absolute bottom-[-12px] left-1/2 transform -translate-x-1/2 p-2 w-9 h-9 flex items-center justify-center bg-primary text-white rounded-full shadow-md hover:bg-primary-dark transition-all duration-200 cursor-pointer"
                        >
                            <IconPencilPaper className="w-4 h-4" />
                        </label>

                        {/* Hidden File Input */}
                        <input
                            id="imageUpload"
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                    setImage(file);
                                    setImagePreview(URL.createObjectURL(file));
                                }
                            }}
                        />
                    </div>

                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div>
                            <label htmlFor="companyName">Company Name</label>
                            <input id="companyName" type="text" className="form-input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
                        </div>
                        <div>
                            <label htmlFor="phoneNumber">Phone</label>
                            <input id="phoneNumber" type="text" className="form-input" value={companyPhone} onChange={(e) => setCompanyPhone(e.target.value)} />
                        </div>
                        <div>
                            <label htmlFor="address">Address</label>
                            <input id="address" type="text" className="form-input" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} />
                        </div>
                        <div>
                            <label htmlFor="manager">Manager</label>
                            <input id="manager" type="text" className="form-input" value={companyManager} onChange={(e) => setCompanyManager(e.target.value)} />
                        </div>
                        <div>
                            <label htmlFor="brn">Business Registration Number</label>
                            <input
                                id="brn"
                                type="text"
                                className="form-input"
                                value={businessRegNumber}
                                onChange={(e) => setBusinessRegNumber(e.target.value)}
                                placeholder="Optional"
                            />
                        </div>
                        <div>
                            <label htmlFor="vat">VAT Number</label>
                            <input
                                id="vat"
                                type="text"
                                className="form-input"
                                value={vatNumber}
                                onChange={(e) => setVatNumber(e.target.value)}
                                placeholder="Optional"
                            />
                        </div>
                        <div className="sm:col-span-2 mt-3 flex justify-end">
                            <button type="button" className="btn btn-primary" onClick={updateUserDetails} disabled={loading}>
                                {loading ? 'Saving...' : 'Update'}
                            </button>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
};

export default Company;
