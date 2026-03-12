import React from 'react';
import { Link } from 'react-router-dom'; // Adjust this import if you're not using react-router-dom
import IconMultipleForwardRight from '../components/Icon/IconMultipleForwardRight';

const TopSellingProducts: React.FC = () => {
    return (
        <div className="grid lg:grid-cols-1 grid-cols-1 gap-6">
            <div className="panel h-full w-full">
                <div className="flex items-center justify-between mb-5">
                    <h5 className="font-semibold text-lg dark:text-white-light">Top Selling Product</h5>
                </div>
                <div className="table-responsive">
                    <table>
                        <thead>
                            <tr className="border-b-0">
                                <th className="ltr:rounded-l-md rtl:rounded-r-md">Product</th>
                                <th>Price</th>
                                <th>Sold</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                {
                                    img: '/assets/images/product-headphones.jpg',
                                    name: 'Headphone',
                                    category: 'Digital',
                                    categoryClass: 'text-primary',
                                    price: '$168.09',
                                    discount: '$60.09',
                                    sold: 170,
                                    source: 'Direct',
                                    sourceClass: 'text-danger',
                                },
                                {
                                    img: '/assets/images/product-shoes.jpg',
                                    name: 'Shoes',
                                    category: 'Fashion',
                                    categoryClass: 'text-warning',
                                    price: '$126.04',
                                    discount: '$47.09',
                                    sold: 130,
                                    source: 'Google',
                                    sourceClass: 'text-success',
                                },
                                {
                                    img: '/assets/images/product-watch.jpg',
                                    name: 'Watch',
                                    category: 'Accessories',
                                    categoryClass: 'text-danger',
                                    price: '$56.07',
                                    discount: '$20.00',
                                    sold: 66,
                                    source: 'Ads',
                                    sourceClass: 'text-warning',
                                },
                                {
                                    img: '/assets/images/product-laptop.jpg',
                                    name: 'Laptop',
                                    category: 'Digital',
                                    categoryClass: 'text-primary',
                                    price: '$110.00',
                                    discount: '$33.00',
                                    sold: 35,
                                    source: 'Email',
                                    sourceClass: 'text-secondary',
                                },
                                {
                                    img: '/assets/images/product-camera.jpg',
                                    name: 'Camera',
                                    category: 'Digital',
                                    categoryClass: 'text-primary',
                                    price: '$56.07',
                                    discount: '$26.04',
                                    sold: 30,
                                    source: 'Referral',
                                    sourceClass: 'text-primary',
                                },
                            ].map((product, index) => (
                                <tr
                                    key={index}
                                    className="text-white-dark hover:text-black dark:hover:text-white-light/90 group"
                                >
                                    <td className="min-w-[150px] text-black dark:text-white">
                                        <div className="flex">
                                            <img
                                                className="w-8 h-8 rounded-md ltr:mr-3 rtl:ml-3 object-cover"
                                                src={product.img}
                                                alt={product.name}
                                            />
                                            <p className="whitespace-nowrap">
                                                {product.name}
                                                <span className={`${product.categoryClass} block text-xs`}>
                                                    {product.category}
                                                </span>
                                            </p>
                                        </div>
                                    </td>
                                    <td>{product.price}</td>
                                    <td>{product.sold}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default TopSellingProducts;
