import React from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import colors from '../theme/colors';
import BackButton from '../components/BackButton';
import BottomTabBar from '../components/BottomTabBar';
import { LogoutContext } from '../auth/LogoutContext';

// Maps every stack route to the bottom-tab key that should be highlighted
// while it is foregrounded. Drill-down screens reached from a tab (e.g.
// DailyAttendance from Attendance) stay highlighted under their owning tab
// so the user can tell where they are in the hierarchy.
const TAB_FOR_ROUTE = {
  Home: 'Home',

  AttendanceTab: 'Attendance',
  DailyAttendance: 'Attendance',
  DailyShiftSchedule: 'Attendance',
  MonthlySummary: 'Attendance',
  LeaveReport: 'Attendance',
  TechnicianApplyLeave: 'Attendance',
  PermissionApply: 'Attendance',

  TasksTab: 'Tasks',
  TaskAssign: 'Tasks',
  TaskReport: 'Tasks',
  PickupAssign: 'Tasks',
  PickupReport: 'Tasks',
  PickupRepairEstimate: 'Tasks',
  PickupEstimateDetail: 'Tasks',
  PickupHistory: 'Tasks',
  PickupSelectBrand: 'Tasks',
  PickupSelectModel: 'Tasks',
  PickupDeviceColorStorage: 'Tasks',
  PickupDeviceServices: 'Tasks',
  PickupServicePriceEstimate: 'Tasks',
  PickupDeviceInformation: 'Tasks',
  PickupDeviceSecurity: 'Tasks',
  PickupDeviceMissingParts: 'Tasks',
  PickupServiceBookingDevicesList: 'Tasks',
  TechnicianDashboard: 'Tasks',
  TechnicianTicketDetail: 'Tasks',
  TechnicianBookingTimeline: 'Tasks',
  UploadRepairImages: 'Tasks',
  SolutionPackUpload: 'Tasks',
  SolutionPackReferenceView: 'Tasks',

  AccountTab: 'Account',
  TechnicianProfile: 'Account',
  SalaryReport: 'Account',
  Payslip: 'Account',
  WorkExperience: 'Account',
  TechnicianKycIntro: 'Account',
  TechnicianKycUpload: 'Account',
  TechnicianKycView: 'Account',

  // Reachable from the Home header bell; stay highlighted under Home.
  Notifications: 'Home',
  // Reachable from the Home header scan icon; opens the scanned ticket.
  ScanTicketQr: 'Home',
};

// Screens in the focused Repair Estimate flow — bottom tab bar is hidden
// so the technician isn't tempted to jump out mid-task. The repair-estimate
// flow always begins after the technician confirms "Repair Estimate" on
// PickupAssign, so once they're in this set we keep the canvas clean.
const HIDE_BOTTOM_TAB_ROUTES = new Set([
  'PickupSelectBrand',
  'PickupSelectModel',
  'PickupDeviceColorStorage',
  'PickupDeviceServices',
  'PickupServicePriceEstimate',
  'PickupDeviceInformation',
  'PickupDeviceSecurity',
  'PickupDeviceMissingParts',
  'PickupServiceBookingDevicesList',
  // Salary report and Pay slip are read-only / action-driven screens where the
  // tab bar competes with the Download/Share buttons at the bottom of the page.
  'SalaryReport',
  'Payslip',
  // Service-history rail has its own gradient hero + back chevron — no tab bar.
  'TechnicianBookingTimeline',
]);

// Tab roots (have their own bottom tab bar — header hidden)
import HomeScreen from '../screens/HomeScreen';
import AttendanceTabScreen from '../screens/AttendanceTabScreen';
import TasksTabScreen from '../screens/TasksTabScreen';
import AccountTabScreen from '../screens/AccountTabScreen';

// Category drill-down screens
import DailyAttendanceScreen from '../screens/DailyAttendanceScreen';
import DailyShiftScheduleScreen from '../screens/DailyShiftScheduleScreen';
import MonthlySummaryScreen from '../screens/MonthlySummaryScreen';
import LeaveReportScreen from '../screens/LeaveReportScreen';
import TaskAssignScreen from '../screens/TaskAssignScreen';
import TaskReportScreen from '../screens/TaskReportScreen';
import PickupAssignScreen from '../screens/PickupAssignScreen';
import PickupReportScreen from '../screens/PickupReportScreen';
import PickupRepairEstimateScreen from '../screens/PickupRepairEstimateScreen';
import PickupEstimateDetailScreen from '../screens/PickupEstimateDetailScreen';
import PickupHistoryScreen from '../screens/PickupHistoryScreen';
import PickupSelectBrandScreen from '../screens/PickupSelectBrandScreen';
import PickupSelectModelScreen from '../screens/PickupSelectModelScreen';
import PickupDeviceColorStorageScreen from '../screens/PickupDeviceColorStorageScreen';
import PickupDeviceServicesScreen from '../screens/PickupDeviceServicesScreen';
import PickupServicePriceEstimateScreen from '../screens/PickupServicePriceEstimateScreen';
import PickupDeviceInformationScreen from '../screens/PickupDeviceInformationScreen';
import PickupDeviceSecurityScreen from '../screens/PickupDeviceSecurityScreen';
import PickupDeviceMissingPartsScreen from '../screens/PickupDeviceMissingPartsScreen';
import PickupServiceBookingDevicesListScreen from '../screens/PickupServiceBookingDevicesListScreen';
import SalaryReportScreen from '../screens/SalaryReportScreen';
import PayslipScreen from '../screens/PayslipScreen';

// Existing technician workflow screens (reused from the original flow)
import TechnicianProfileScreen from '../screens/TechnicianProfileScreen';
import TechnicianDashboardScreen from '../screens/TechnicianDashboardScreen';
import TechnicianTicketDetailScreen from '../screens/TechnicianTicketDetailScreen';
import TechnicianBookingTimelineScreen from '../screens/TechnicianBookingTimelineScreen';
import UploadRepairImagesScreen from '../screens/UploadRepairImagesScreen';
import TechnicianApplyLeaveScreen from '../screens/TechnicianApplyLeaveScreen';
import PermissionApplyScreen from '../screens/PermissionApplyScreen';
import SolutionPackUploadScreen from '../screens/SolutionPackUploadScreen';
import SolutionPackReferenceViewScreen from '../screens/SolutionPackReferenceViewScreen';
import WorkExperienceScreen from '../screens/WorkExperienceScreen';
import TechnicianKycIntroScreen from '../screens/TechnicianKycIntroScreen';
import TechnicianKycUploadScreen from '../screens/TechnicianKycUploadScreen';
import TechnicianKycViewScreen from '../screens/TechnicianKycViewScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import ScanTicketQrScreen from '../screens/ScanTicketQrScreen';

const Stack = createNativeStackNavigator();

export default function TechnicianNavigator({ session, onLogout }) {
  return (
    <LogoutContext.Provider value={onLogout}>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={({ navigation }) => ({
          headerStyle: { backgroundColor: colors.headerBg },
          headerShadowVisible: true,
          headerTintColor: colors.headerText,
          headerTitleStyle: { fontSize: 17, fontWeight: '700', color: colors.headerText },
          headerTitleAlign: 'center',
          headerTitleAllowFontScaling: false,
          headerLeft: () => {
            if (!navigation.canGoBack()) return null;
            return <BackButton onPress={() => navigation.goBack()} />;
          },
          headerBackVisible: false,
        })}
        // Render the technician bottom-tab bar on every screen in this stack
        // by wrapping each screen with a layout. The previous setup mounted
        // the bar inside individual tab-root screens (Home / AttendanceTab /
        // TasksTab / AccountTab) which meant drill-down screens like
        // DailyAttendance and TaskReport lost the bar. Doing it here keeps
        // the four bottom-tab buttons reachable from anywhere in the stack.
        screenLayout={({ route, navigation, children }) => (
          <View style={{ flex: 1 }}>
            {/* Content gets its own flex:1 region so it always sits ABOVE the
                tab bar — the bar is a normal flex child now, not an absolute
                overlay, so nothing can hide behind it in any nav mode. */}
            <View style={{ flex: 1 }}>{children}</View>
            {HIDE_BOTTOM_TAB_ROUTES.has(route.name) ? null : (
              <BottomTabBar
                active={TAB_FOR_ROUTE[route.name] || 'Home'}
                navigation={navigation}
              />
            )}
          </View>
        )}
      >
        {/* Tab roots — their own custom bottom bar, no native header */}
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AttendanceTab" component={AttendanceTabScreen} options={{ headerShown: false }} />
        <Stack.Screen name="TasksTab" component={TasksTabScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AccountTab" component={AccountTabScreen} options={{ headerShown: false }} />

        {/* Category drill-downs */}
        <Stack.Screen name="DailyAttendance" component={DailyAttendanceScreen} options={{ title: 'Daily Attendance' }} />
        <Stack.Screen name="DailyShiftSchedule" component={DailyShiftScheduleScreen} options={{ title: 'Daily Shift Schedule' }} />
        <Stack.Screen name="MonthlySummary" component={MonthlySummaryScreen} options={{ title: 'Monthly Summary' }} />
        <Stack.Screen name="LeaveReport" component={LeaveReportScreen} options={{ title: 'Leave Report' }} />
        <Stack.Screen name="TaskAssign" component={TaskAssignScreen} options={{ title: 'Assign Task' }} />
        <Stack.Screen name="TaskReport" component={TaskReportScreen} options={{ title: 'Task Report' }} />
        <Stack.Screen name="PickupAssign" component={PickupAssignScreen} options={{ title: 'Assign Pickup' }} />
        <Stack.Screen name="PickupReport" component={PickupReportScreen} options={{ title: 'Pickup Report' }} />
        <Stack.Screen name="PickupRepairEstimate" component={PickupRepairEstimateScreen} options={{ title: 'Repair Estimate Processing' }} />
        <Stack.Screen name="PickupEstimateDetail" component={PickupEstimateDetailScreen} options={{ title: 'Estimate Details' }} />
        <Stack.Screen name="PickupHistory" component={PickupHistoryScreen} options={{ title: 'Pickup History' }} />
        <Stack.Screen name="PickupSelectBrand" component={PickupSelectBrandScreen} options={{ title: 'Select Device Brand' }} />
        <Stack.Screen name="PickupSelectModel" component={PickupSelectModelScreen} options={{ title: 'Select Device Model' }} />
        <Stack.Screen name="PickupDeviceColorStorage" component={PickupDeviceColorStorageScreen} options={{ title: 'Color, RAM & Storage' }} />
        <Stack.Screen name="PickupDeviceServices" component={PickupDeviceServicesScreen} options={{ title: 'Device Services' }} />
        <Stack.Screen name="PickupServicePriceEstimate" component={PickupServicePriceEstimateScreen} options={{ title: 'Service Price, Issue & Estimated Time' }} />
        <Stack.Screen name="PickupDeviceInformation" component={PickupDeviceInformationScreen} options={{ title: 'Device Information' }} />
        <Stack.Screen name="PickupDeviceSecurity" component={PickupDeviceSecurityScreen} options={{ title: 'Device Security' }} />
        <Stack.Screen name="PickupDeviceMissingParts" component={PickupDeviceMissingPartsScreen} options={{ title: 'Device Missing Parts' }} />
        <Stack.Screen name="PickupServiceBookingDevicesList" component={PickupServiceBookingDevicesListScreen} options={{ title: 'Service Booking Devices List' }} />
        <Stack.Screen name="SalaryReport" component={SalaryReportScreen} options={{ title: 'Salary Report' }} />
        <Stack.Screen name="Payslip" component={PayslipScreen} options={{ title: 'Pay slip' }} />

        {/* Existing technician workflow */}
        <Stack.Screen name="TechnicianProfile" component={TechnicianProfileScreen} options={{ title: 'My Profile' }} />
        <Stack.Screen name="TechnicianDashboard" component={TechnicianDashboardScreen} options={{ title: 'Dashboard' }} />
        <Stack.Screen name="TechnicianTicketDetail" component={TechnicianTicketDetailScreen} options={{ title: 'Ticket Detail' }} />
        <Stack.Screen name="TechnicianBookingTimeline" component={TechnicianBookingTimelineScreen} options={{ headerShown: false }} />
        <Stack.Screen name="UploadRepairImages" component={UploadRepairImagesScreen} options={{ title: 'Upload Images' }} />
        <Stack.Screen name="TechnicianApplyLeave" component={TechnicianApplyLeaveScreen} options={{ title: 'Apply for leave' }} />
        <Stack.Screen name="PermissionApply" component={PermissionApplyScreen} options={{ title: 'Apply for Permission' }} />
        <Stack.Screen name="SolutionPackUpload" component={SolutionPackUploadScreen} options={{ title: 'New Issue Solution Pack Upload' }} />
        <Stack.Screen name="SolutionPackReferenceView" component={SolutionPackReferenceViewScreen} options={{ title: 'Issue Reference Solution Pack View' }} />
        <Stack.Screen name="WorkExperience" component={WorkExperienceScreen} options={{ title: 'Work Experience' }} />
        <Stack.Screen name="TechnicianKycIntro" component={TechnicianKycIntroScreen} options={{ title: 'KYC Verification' }} />
        <Stack.Screen name="TechnicianKycUpload" component={TechnicianKycUploadScreen} options={{ title: 'Upload Documents' }} />
        <Stack.Screen name="TechnicianKycView" component={TechnicianKycViewScreen} options={{ title: 'KYC Documents' }} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
        <Stack.Screen name="ScanTicketQr" component={ScanTicketQrScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </LogoutContext.Provider>
  );
}
