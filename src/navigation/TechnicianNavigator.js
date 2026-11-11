import React from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import colors from '../theme/colors';
import BackButton from '../components/BackButton';
import { StackHeader } from '../components/MintScreenHeader';
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
  PickupDetails: 'Tasks',
  PickupCalendar: 'Tasks',
  PickupRecords: 'Tasks',
  PickupReport: 'Tasks',
  PickupRepairEstimate: 'Tasks',
  PickupEstimateDetail: 'Tasks',
  PickupHistory: 'Tasks',
  PickupSelectBrand: 'Tasks',
  PickupDeviceDetails: 'Tasks',
  PickupDevicesRepair: 'Tasks',
  PickupSelectModel: 'Tasks',
  PickupDeviceColorStorage: 'Tasks',
  PickupDeviceServices: 'Tasks',
  PickupServicePriceEstimate: 'Tasks',
  PickupDeviceInformation: 'Tasks',
  PickupDeviceSecurity: 'Tasks',
  PickupDeviceMissingParts: 'Tasks',
  PickupServiceBookingDevicesList: 'Tasks',
  SellInspectScreening: 'Tasks',
  SellInspectScreen: 'Tasks',
  SellInspectFunctional: 'Tasks',
  SellInspectAccessories: 'Tasks',
  SellVerifyOtp: 'Tasks',
  SellCompare: 'Tasks',
  SellInspection: 'Tasks',
  BuyDeliveries: 'Tasks',
  BuyDelivery: 'Tasks',
  RepairDeliveries: 'Tasks',
  RepairDelivery: 'Tasks',
  SellPriceRevision: 'Tasks',
  SellCustomerConfirm: 'Tasks',
  SellPayment: 'Tasks',
  TechnicianDashboard: 'Tasks',
  TechnicianTicketDetail: 'Tasks',
  TechnicianBookingTimeline: 'Tasks',
  UploadRepairImages: 'Tasks',
  SolutionPackUpload: 'Tasks',
  SolutionPackReferenceView: 'Tasks',
  SolutionPackDetails: 'Tasks',
  SolutionPacks: 'Account',
  SolutionPackRecords: 'Account',

  AccountTab: 'Account',
  TechnicianProfile: 'Account',
  SalaryReport: 'Account',
  Payslip: 'Account',
  WorkExperience: 'Account',
  HelpSupport: 'Account',
  TechnicianKycIntro: 'Account',
  TechnicianKycUpload: 'Account',
  TechnicianKycView: 'Account',

  // Reachable from the Home header bell; stay highlighted under Home.
  Notifications: 'Home',
  // Staff Tasks (general shop tasks) — entered from Home → My Tasks.
  MyTasks: 'Home',
  TaskDetails: 'Home',
  TaskUpdate: 'Home',
  TaskCalendar: 'Home',
  TaskHistory: 'Home',
  // Reachable from the Home header scan icon; opens the scanned ticket.
  ScanTicketQr: 'Home',
};

// Screens in the focused Repair Estimate flow — bottom tab bar is hidden
// so the technician isn't tempted to jump out mid-task. The repair-estimate
// flow always begins after the technician confirms "Repair Estimate" on
// PickupAssign, so once they're in this set we keep the canvas clean.
const HIDE_BOTTOM_TAB_ROUTES = new Set([
  // Apply forms (opened from Home Quick Access): full-screen, no tab bar.
  'TechnicianApplyLeave',
  'PermissionApply',
  // Pickup Details has its own action bar (next step / Unable to Pickup).
  'PickupDetails',
  'PickupDeviceDetails',
  'PickupDevicesRepair',
  'PickupSelectBrand',
  'PickupSelectModel',
  'PickupDeviceColorStorage',
  'PickupDeviceServices',
  'PickupServicePriceEstimate',
  'PickupDeviceInformation',
  'PickupDeviceSecurity',
  'PickupDeviceMissingParts',
  'PickupServiceBookingDevicesList',
  // Device-purchase inspection at Device Collected (screens/sell).
  'SellInspectScreening',
  'SellInspectScreen',
  'SellInspectFunctional',
  'SellInspectAccessories',
  // Device purchase at the door: OTP → Compare & Inspect → Price → Payment & Pickup.
  'SellVerifyOtp',
  'SellCompare',
  'SellInspection',
  'BuyDeliveries',
  'BuyDelivery',
  'RepairDeliveries',
  'RepairDelivery',
  'SellPriceRevision',
  'SellCustomerConfirm',
  'SellPayment',
  // Salary report and Pay slip are read-only / action-driven screens where the
  // tab bar competes with the Download/Share buttons at the bottom of the page.
  'SalaryReport',
  'Payslip',
  // Service-history rail has its own gradient hero + back chevron — no tab bar.
  'TechnicianBookingTimeline',
  // Job Details: full-screen, no tab bar.
  'TechnicianTicketDetail',
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
import JobReportScreen from '../screens/JobReportScreen';
import PickupAssignScreen from '../screens/PickupAssignScreen';
import PickupDetailsScreen from '../screens/PickupDetailsScreen';
import PickupCalendarScreen from '../screens/PickupCalendarScreen';
import PickupRecordsScreen from '../screens/PickupRecordsScreen';
import PickupReportScreen from '../screens/PickupReportScreen';
import PickupRepairEstimateScreen from '../screens/PickupRepairEstimateScreen';
import PickupEstimateDetailScreen from '../screens/PickupEstimateDetailScreen';
import PickupHistoryScreen from '../screens/PickupHistoryScreen';
import PickupSelectBrandScreen from '../screens/PickupSelectBrandScreen';
import PickupDeviceDetailsScreen from '../screens/PickupDeviceDetailsScreen';
import PickupDevicesRepairScreen from '../screens/PickupDevicesRepairScreen';
import PickupSelectModelScreen from '../screens/PickupSelectModelScreen';
import PickupDeviceColorStorageScreen from '../screens/PickupDeviceColorStorageScreen';
import PickupDeviceServicesScreen from '../screens/PickupDeviceServicesScreen';
import PickupServicePriceEstimateScreen from '../screens/PickupServicePriceEstimateScreen';
import PickupDeviceInformationScreen from '../screens/PickupDeviceInformationScreen';
import PickupDeviceSecurityScreen from '../screens/PickupDeviceSecurityScreen';
import PickupDeviceMissingPartsScreen from '../screens/PickupDeviceMissingPartsScreen';
import PickupServiceBookingDevicesListScreen from '../screens/PickupServiceBookingDevicesListScreen';
import SellInspectScreeningScreen from '../screens/sell/SellInspectScreeningScreen';
import SellInspectScreenConditionScreen from '../screens/sell/SellInspectScreenConditionScreen';
import SellInspectFunctionalScreen from '../screens/sell/SellInspectFunctionalScreen';
import SellInspectAccessoriesScreen from '../screens/sell/SellInspectAccessoriesScreen';
import SellVerifyOtpScreen from '../screens/sell/SellVerifyOtpScreen';
import SellCompareScreen from '../screens/sell/SellCompareScreen';
import SellInspectionScreen from '../screens/sell/SellInspectionScreen';
import BuyDeliveriesScreen from '../screens/delivery/BuyDeliveriesScreen';
import RepairDeliveriesScreen from '../screens/delivery/RepairDeliveriesScreen';
import RepairDeliveryScreen from '../screens/delivery/RepairDeliveryScreen';
import BuyDeliveryScreen from '../screens/delivery/BuyDeliveryScreen';
import SellPriceRevisionScreen from '../screens/sell/SellPriceRevisionScreen';
import SellCustomerConfirmScreen from '../screens/sell/SellCustomerConfirmScreen';
import SellPaymentScreen from '../screens/sell/SellPaymentScreen';
import SalaryReportScreen from '../screens/SalaryReportScreen';
import PayslipScreen from '../screens/PayslipScreen';

// Existing technician workflow screens (reused from the original flow)
import TechnicianProfileScreen from '../screens/TechnicianProfileScreen';
import TechnicianDashboardScreen from '../screens/TechnicianDashboardScreen';
import JobDetailsScreen from '../screens/JobDetailsScreen';
import TechnicianBookingTimelineScreen from '../screens/TechnicianBookingTimelineScreen';
import UploadRepairImagesScreen from '../screens/UploadRepairImagesScreen';
import TechnicianApplyLeaveScreen from '../screens/TechnicianApplyLeaveScreen';
import PermissionApplyScreen from '../screens/PermissionApplyScreen';
import SolutionPackUploadScreen from '../screens/SolutionPackUploadScreen';
import SolutionPackReferenceViewScreen from '../screens/SolutionPackReferenceViewScreen';
import SolutionPacksHomeScreen from '../screens/SolutionPacksHomeScreen';
import SolutionPackDetailsScreen from '../screens/SolutionPackDetailsScreen';
import SolutionPackRecordsScreen from '../screens/SolutionPackRecordsScreen';
import WorkExperienceScreen from '../screens/WorkExperienceScreen';
import HelpSupportScreen from '../screens/HelpSupportScreen';
import TechnicianKycIntroScreen from '../screens/TechnicianKycIntroScreen';
import TechnicianKycUploadScreen from '../screens/TechnicianKycUploadScreen';
import TechnicianKycViewScreen from '../screens/TechnicianKycViewScreen';
import NotificationsScreen from '../screens/NotificationsScreen';
import MyTasksScreen from '../screens/MyTasksScreen';
import TaskDetailsScreen from '../screens/TaskDetailsScreen';
import TaskUpdateScreen from '../screens/TaskUpdateScreen';
import TaskCalendarScreen from '../screens/TaskCalendarScreen';
import TaskHistoryScreen from '../screens/TaskHistoryScreen';
import ScanTicketQrScreen from '../screens/ScanTicketQrScreen';
import TabletFrame from '../components/TabletFrame';

const Stack = createNativeStackNavigator();

export default function TechnicianNavigator({ session, onLogout }) {
  return (
    <LogoutContext.Provider value={onLogout}>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={({ navigation }) => ({
          // One shared header (same back button + title size) for every screen.
          header: (props) => <StackHeader {...props} />,
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
        // Render ONE technician bottom-tab bar around the whole stack (not per
        // screen), so it stays fixed while screens slide in above it — same as
        // the partner app's tab bar. It follows the focused route, which keeps
        // the four bottom-tab buttons reachable from anywhere in the stack.
        // On tablets the whole stack + bar sits in one centred column
        // (TabletFrame); phones render edge to edge.
        layout={({ state, navigation, children }) => {
          const route = state.routes[state.index];
          const hideBar = HIDE_BOTTOM_TAB_ROUTES.has(route.name);
          return (
            <TabletFrame>
              <View style={{ flex: 1 }}>
                {/* Content gets its own flex:1 region so it always sits ABOVE the
                    tab bar — the bar is a normal flex child, not an absolute
                    overlay, so nothing can hide behind it in any nav mode. */}
                <View style={{ flex: 1 }}>{children}</View>
                {hideBar ? null : (
                  <BottomTabBar
                    active={TAB_FOR_ROUTE[route.name] || 'Home'}
                    navigation={navigation}
                    routeName={route.name}
                  />
                )}
              </View>
            </TabletFrame>
          );
        }}
      >
        {/* Tab roots — their own custom bottom bar, no native header */}
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AttendanceTab" component={AttendanceTabScreen} options={{ headerShown: false }} />
        <Stack.Screen name="TasksTab" component={TasksTabScreen} options={{ headerShown: false }} />
        <Stack.Screen name="AccountTab" component={AccountTabScreen} options={{ headerShown: false }} />

        {/* Category drill-downs */}
        <Stack.Screen name="DailyAttendance" component={DailyAttendanceScreen} options={{ headerShown: false }} />
        <Stack.Screen name="DailyShiftSchedule" component={DailyShiftScheduleScreen} options={{ headerShown: false }} />
        <Stack.Screen name="MonthlySummary" component={MonthlySummaryScreen} options={{ title: 'Monthly Summary' }} />
        <Stack.Screen name="LeaveReport" component={LeaveReportScreen} options={{ headerShown: false }} />
        <Stack.Screen name="TaskReport" component={JobReportScreen} options={{ headerShown: false }} />
        <Stack.Screen name="PickupAssign" component={PickupAssignScreen} options={{ title: 'My Pickups' }} />
        <Stack.Screen name="PickupDetails" component={PickupDetailsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="PickupCalendar" component={PickupCalendarScreen} options={{ headerShown: false }} />
        <Stack.Screen name="PickupRecords" component={PickupRecordsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="PickupReport" component={PickupReportScreen} options={{ title: 'Pickup Report' }} />
        <Stack.Screen name="PickupRepairEstimate" component={PickupRepairEstimateScreen} options={{ title: 'Repair Estimate Processing' }} />
        <Stack.Screen name="PickupEstimateDetail" component={PickupEstimateDetailScreen} options={{ title: 'Estimate Details' }} />
        <Stack.Screen name="PickupHistory" component={PickupHistoryScreen} options={{ headerShown: false }} />
        <Stack.Screen name="PickupDeviceDetails" component={PickupDeviceDetailsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="PickupDevicesRepair" component={PickupDevicesRepairScreen} options={{ headerShown: false }} />
        <Stack.Screen name="PickupSelectBrand" component={PickupSelectBrandScreen} options={{ title: 'Select Device Brand' }} />
        <Stack.Screen name="PickupSelectModel" component={PickupSelectModelScreen} options={{ title: 'Select Device Model' }} />
        <Stack.Screen name="PickupDeviceColorStorage" component={PickupDeviceColorStorageScreen} options={{ title: 'Color, RAM & Storage' }} />
        <Stack.Screen name="PickupDeviceServices" component={PickupDeviceServicesScreen} options={{ title: 'Device Services' }} />
        <Stack.Screen name="PickupServicePriceEstimate" component={PickupServicePriceEstimateScreen} options={{ title: 'Service Price, Issue & Estimated Time' }} />
        <Stack.Screen name="PickupDeviceInformation" component={PickupDeviceInformationScreen} options={{ title: 'Device Information' }} />
        <Stack.Screen name="PickupDeviceSecurity" component={PickupDeviceSecurityScreen} options={{ title: 'Device Security' }} />
        <Stack.Screen name="PickupDeviceMissingParts" component={PickupDeviceMissingPartsScreen} options={{ title: 'Device Missing Parts' }} />
        <Stack.Screen name="PickupServiceBookingDevicesList" component={PickupServiceBookingDevicesListScreen} options={{ title: 'Service Booking Devices List' }} />
        <Stack.Screen name="SellInspectScreening" component={SellInspectScreeningScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SellInspectScreen" component={SellInspectScreenConditionScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SellInspectFunctional" component={SellInspectFunctionalScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SellInspectAccessories" component={SellInspectAccessoriesScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SellVerifyOtp" component={SellVerifyOtpScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SellCompare" component={SellCompareScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SellInspection" component={SellInspectionScreen} options={{ headerShown: false }} />
        <Stack.Screen name="BuyDeliveries" component={BuyDeliveriesScreen} options={{ headerShown: false }} />
        <Stack.Screen name="BuyDelivery" component={BuyDeliveryScreen} options={{ headerShown: false }} />
        <Stack.Screen name="RepairDeliveries" component={RepairDeliveriesScreen} options={{ headerShown: false }} />
        <Stack.Screen name="RepairDelivery" component={RepairDeliveryScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SellPriceRevision" component={SellPriceRevisionScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SellCustomerConfirm" component={SellCustomerConfirmScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SellPayment" component={SellPaymentScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SalaryReport" component={SalaryReportScreen} options={{ title: 'Salary Report' }} />
        <Stack.Screen name="Payslip" component={PayslipScreen} options={{ title: 'Pay slip' }} />

        {/* Existing technician workflow */}
        <Stack.Screen name="TechnicianProfile" component={TechnicianProfileScreen} options={{ headerShown: false }} />
        <Stack.Screen name="TechnicianDashboard" component={TechnicianDashboardScreen} options={{ title: 'Dashboard' }} />
        <Stack.Screen name="TechnicianTicketDetail" component={JobDetailsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="TechnicianBookingTimeline" component={TechnicianBookingTimelineScreen} options={{ headerShown: false }} />
        <Stack.Screen name="UploadRepairImages" component={UploadRepairImagesScreen} options={{ title: 'Upload Images' }} />
        <Stack.Screen name="TechnicianApplyLeave" component={TechnicianApplyLeaveScreen} options={{ title: 'Apply for leave' }} />
        <Stack.Screen name="PermissionApply" component={PermissionApplyScreen} options={{ title: 'Apply for Permission' }} />
        <Stack.Screen name="SolutionPackUpload" component={SolutionPackUploadScreen} options={{ title: 'Upload New' }} />
        <Stack.Screen name="SolutionPackReferenceView" component={SolutionPackReferenceViewScreen} options={{ title: 'View Reference' }} />
        <Stack.Screen name="SolutionPacks" component={SolutionPacksHomeScreen} options={{ title: 'Solution Packs' }} />
        <Stack.Screen name="SolutionPackDetails" component={SolutionPackDetailsScreen} options={{ title: 'Reference Details' }} />
        <Stack.Screen name="SolutionPackRecords" component={SolutionPackRecordsScreen} options={{ title: 'My Repair Records' }} />
        <Stack.Screen name="WorkExperience" component={WorkExperienceScreen} options={{ title: 'Work Experience' }} />
        <Stack.Screen name="HelpSupport" component={HelpSupportScreen} options={{ headerShown: false }} />
        <Stack.Screen name="TechnicianKycIntro" component={TechnicianKycIntroScreen} options={{ title: 'KYC Details' }} />
        <Stack.Screen name="TechnicianKycUpload" component={TechnicianKycUploadScreen} options={{ title: 'Upload Documents' }} />
        <Stack.Screen name="TechnicianKycView" component={TechnicianKycViewScreen} options={{ title: 'KYC Documents' }} />
        <Stack.Screen name="Notifications" component={NotificationsScreen} options={{ title: 'Notifications' }} />
        <Stack.Screen name="MyTasks" component={MyTasksScreen} options={{ headerShown: false }} />
        <Stack.Screen name="TaskDetails" component={TaskDetailsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="TaskUpdate" component={TaskUpdateScreen} options={{ headerShown: false }} />
        <Stack.Screen name="TaskCalendar" component={TaskCalendarScreen} options={{ headerShown: false }} />
        <Stack.Screen name="TaskHistory" component={TaskHistoryScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ScanTicketQr" component={ScanTicketQrScreen} options={{ headerShown: false }} />
      </Stack.Navigator>
    </LogoutContext.Provider>
  );
}
