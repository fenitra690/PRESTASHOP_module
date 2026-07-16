import * as dotenv from 'dotenv'
dotenv.config()
import axios from 'axios'
const WS_KEY = process.env.VITE_PS_WS_KEY
axios
  .post(
    'http://localhost/prestashop/api/orders?ws_key=' + WS_KEY,
    '<?xml version="1.0" encoding="UTF-8"?><prestashop xmlns:xlink="http://www.w3.org/1999/xlink"><order><id_address_delivery><![CDATA[1]]></id_address_delivery><id_address_invoice><![CDATA[1]]></id_address_invoice><id_cart><![CDATA[1]]></id_cart><id_currency><![CDATA[1]]></id_currency><id_lang><![CDATA[1]]></id_lang><id_customer><![CDATA[1]]></id_customer><id_carrier><![CDATA[1]]></id_carrier><module><![CDATA[ps_cashondelivery]]></module><payment><![CDATA[Paiement]]></payment><total_paid><![CDATA[0]]></total_paid><total_paid_real><![CDATA[0]]></total_paid_real><total_products><![CDATA[0]]></total_products><total_products_wt><![CDATA[0]]></total_products_wt><total_shipping><![CDATA[0]]></total_shipping><total_shipping_tax_excl><![CDATA[0]]></total_shipping_tax_excl><total_shipping_tax_incl><![CDATA[0]]></total_shipping_tax_incl><current_state><![CDATA[1]]></current_state><conversion_rate><![CDATA[1]]></conversion_rate></order></prestashop>',
    { headers: { 'Content-Type': 'text/xml' } },
  )
  .then((r) => console.log(r.data))
  .catch((e) => console.error(e.response?.data || e.message))
