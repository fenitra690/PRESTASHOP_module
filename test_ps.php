<?php
define('_PS_MODE_DEV_', true);
require('C:/xampp/htdocs/Pestashop1/config/config.inc.php');
try {
    $webservice = new WebserviceRequest();
    // we won't fully emulate it, just the object saving part...
} catch (Exception $e) { }
