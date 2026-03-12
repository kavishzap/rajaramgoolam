import { Printer, Text, Line, Row, render, Image } from 'react-thermal-printer';
import { transforms } from '@react-thermal-printer/image';

type OrderItem = {
    name: string;
    quantity: number;
    price: number;
    code: string;
};

type PrintOrderParams = {
    items: OrderItem[];
    subtotal: number;
    vatPercent: number;
    vatAmount: number;
    grandTotal: number;
    companyLabel?: string | null;
    companyName?: string | null;
    brn?: string | null;
    vatNumber?: string | null;
    orderDate: string;
    paperWidth?: 32 | 48;
    logo?: string | null;
};

async function sendViaUsb(data: Uint8Array) {
    const nav: any = navigator as any;
    const usb = nav?.usb;

    if (!usb) {
        throw new Error('WebUSB is not supported in this browser.');
    }

    // Try to reuse an already-authorized device first
    let device: USBDevice | null = null;
    const devices: USBDevice[] = await usb.getDevices();

    if (devices && devices.length > 0) {
        device = devices[0];
    } else {
        // Fallback: ask user to pick a printer-class device
        device = await usb.requestDevice({
            filters: [
                // USB printer class
                { classCode: 0x07 },
            ],
        });
    }

    if (!device) {
        throw new Error('No USB printer device selected.');
    }

    await device.open();

    if (device.configuration == null) {
        await device.selectConfiguration(1);
    }

    const configuration = device.configuration;
    if (!configuration) {
        throw new Error('USB device has no configuration.');
    }

    const printerInterface = configuration.interfaces.find((iface) =>
        iface.alternates.some((alt) => alt.interfaceClass === 0x07),
    );

    if (!printerInterface) {
        throw new Error('No printer interface found on USB device.');
    }

    const interfaceNumber = printerInterface.interfaceNumber;
    await device.claimInterface(interfaceNumber);

    const alternate = printerInterface.alternates.find((alt) => alt.interfaceClass === 0x07);
    if (!alternate) {
        throw new Error('No printer alternate setting found.');
    }

    const endpoint = alternate.endpoints.find((ep) => ep.direction === 'out');
    if (!endpoint) {
        throw new Error('No OUT endpoint found on printer interface.');
    }

    // Some printers prefer small chunks; keep it simple first
    await device.transferOut(endpoint.endpointNumber, data);
}

export async function printOrderReceipt(params: PrintOrderParams) {
    const {
        items,
        subtotal,
        vatPercent,
        vatAmount,
        grandTotal,
        companyLabel,
        companyName,
        brn,
        vatNumber,
        orderDate,
        paperWidth = 32,
        logo,
    } = params;

    const headerName = companyName || companyLabel || '';
    const logoSrc =
        logo && logo.trim()
            ? logo.trim().startsWith('data:')
                ? logo.trim()
                : `data:image/png;base64,${logo.trim()}`
            : '';

    const receipt = (
        <Printer type="epson" width={paperWidth}>
            {logoSrc ? (
                <Image align="center" src={logoSrc} transforms={[transforms.floydSteinberg]} />
            ) : null}
            <Text align="center" bold>
                Sales Receipt
            </Text>
            {headerName && <Text align="center">{headerName}</Text>}
            {brn && <Text align="center">BRN: {brn}</Text>}
            {vatNumber && <Text align="center">VAT: {vatNumber}</Text>}
            <Text align="center">Date: {orderDate}</Text>
            <Line />
            {items.map((item) => (
                <Text key={item.code} align="center">
                    {item.quantity} x {item.name} - Rs {(item.price * item.quantity).toFixed(2)}
                </Text>
            ))}
            <Line />
            <Row left="Subtotal" right={`Rs ${subtotal.toFixed(2)}`} />
            <Row left={`VAT (${vatPercent.toFixed(2)}%)`} right={`Rs ${vatAmount.toFixed(2)}`} />
            <Row left="Grand Total" right={`Rs ${grandTotal.toFixed(2)}`} bold />
            <Line />
            <Text align="center">Thank you for your purchase!</Text>
            {Array(5)
                .fill(null)
                .map((_, i) => (
                    <Text key={`feed-${i}`}> </Text>
                ))}
        </Printer>
    );

    const data = (await render(receipt)) as Uint8Array;
    await sendViaUsb(data);
}

