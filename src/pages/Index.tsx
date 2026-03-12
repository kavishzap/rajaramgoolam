import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { IRootState } from '../store';
import { setPageTitle } from '../store/themeConfigSlice';
import IconMultipleForwardRight from '../components/Icon/IconMultipleForwardRight';
import RevenueChart from './RevenueCard';
import DashboardSummary from './statisticsCard';
import TopSellingProducts from './TopSelling';
import WeeklySalesChart from './WeeklySalesChart';
import TopProductsChart from './top5';
const Index = () => {
    const dispatch = useDispatch();
    useEffect(() => {
        dispatch(setPageTitle('Sales Admin'));
    });
    const isDark = useSelector((state: IRootState) => state.themeConfig.theme === 'dark' || state.themeConfig.isDarkMode);
    const isRtl = useSelector((state: IRootState) => state.themeConfig.rtlClass) === 'rtl' ? true : false;

    const [loading] = useState(false);

    return (
        <div>
            <h1 className='text-xl'>Dashboard</h1>

            <div className="pt-5">
                <div className="grid xl:grid-cols-1 gap-6 p-3">
                    <DashboardSummary />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 p-3">
                    <div className="panel h-full">
                        <RevenueChart isDark={isDark} isRtl={isRtl} />
                    </div>
                    <div className="panel h-full">
                        <WeeklySalesChart isDark={false} isRtl={false}/>
                    </div>
                    <div className="panel h-full">
                        <TopProductsChart isDark={false} isRtl={false}/>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Index;
