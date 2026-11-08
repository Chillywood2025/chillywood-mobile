import copy, hashlib, importlib.util, json, sys, tempfile, unittest
from pathlib import Path
HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('image_chain',HERE/'harness/image_chain.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
PINS=json.loads((HERE/'image-chains.json').read_text())['images']
sys.path.insert(0,str(HERE/'harness'))
from stack import prepare_fresh_identity, Stack

def observed(pin,config_id=False):
    c=m.verify_chain(pin,pin['reference'])
    return {'RepoDigests':[pin['reference']],'Id':c['configDigest'] if config_id else c['indexDigest'],
        'Os':'linux','Architecture':'amd64','RootFS':{'Type':'layers','Layers':c['rootfsDiffIds']}}

class ImageChains(unittest.TestCase):
    def test_four_actual_cached_public_metadata_chains_and_two_daemon_id_formats(self):
        for name,pin in PINS.items():
            with self.subTest(name=name):
                for classic in [False,True]: m.validate_image(pin,pin['reference'],observed(pin,classic))

    def test_each_raw_component_byte_tamper_rejected(self):
        for name,pin in PINS.items():
            for component in ['index','platformManifest','config']:
                changed=copy.deepcopy(pin);changed[component]['raw']+=' '
                with self.subTest(name=name,component=component),self.assertRaises(ValueError):m.verify_chain(changed,pin['reference'])

    def test_rehashed_child_cannot_escape_parent_descriptor(self):
        for component in ['platformManifest','config']:
            pin=copy.deepcopy(PINS['db']);pin[component]['raw']+=' '
            pin[component]['digest']='sha256:'+hashlib.sha256(pin[component]['raw'].encode()).hexdigest()
            with self.subTest(component=component),self.assertRaises(ValueError):m.verify_chain(pin,pin['reference'])

    def test_wrong_reference_and_tag_fallback_rejected(self):
        pin=PINS['auth']
        for reference in [pin['reference'].split('@')[0]+':latest',PINS['db']['reference'],pin['reference'].replace('public.ecr.aws','evil.invalid')]:
            with self.subTest(reference=reference),self.assertRaises(ValueError):m.validate_image(pin,reference,observed(pin))

    def test_unbound_daemon_id_or_platform_rejected(self):
        pin=PINS['rest']
        for changes in [{'Id':'sha256:'+'0'*64},{'Os':'windows'},{'Architecture':'arm64'},{'Variant':'v8'},{'RepoDigests':[]}]:
            value=observed(pin);value.update(changes)
            with self.subTest(changes=changes),self.assertRaises(ValueError):m.validate_image(pin,pin['reference'],value)

    def test_rootfs_missing_extra_reordered_or_changed_rejected(self):
        pin=PINS['gateway'];base=observed(pin)
        layers=base['RootFS']['Layers']
        for changed in [layers[:-1],layers+['sha256:'+'0'*64],list(reversed(layers)),['sha256:'+'0'*64]+layers[1:]]:
            value=copy.deepcopy(base);value['RootFS']['Layers']=changed
            with self.subTest(changed=changed),self.assertRaises(ValueError):m.validate_image(pin,pin['reference'],value)

    def test_cross_image_config_substitution_rejected(self):
        value=copy.deepcopy(PINS['db']);value['config']=PINS['auth']['config']
        with self.assertRaises(ValueError):m.verify_chain(value,value['reference'])

    def test_caller_nonce_creates_only_exact_new_private_root(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary).resolve()/('chillywood-local-auth-'+'a'*32)
            actual=prepare_fresh_identity(root,'a'*32)
            self.assertEqual(actual,root);self.assertEqual(actual.stat().st_mode&0o077,0)
            with self.assertRaises(FileExistsError):prepare_fresh_identity(root,'a'*32)

    def test_wrong_or_missing_nonce_rejects_before_creation(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary).resolve()/('chillywood-local-auth-'+'b'*32)
            for nonce in [None,'b'*31,'B'*32,'../escape','a'*32]:
                with self.subTest(nonce=nonce),self.assertRaises(AssertionError):prepare_fresh_identity(root,nonce)
                self.assertFalse(root.exists())

    def test_relative_and_symlink_alias_evidence_roots_reject(self):
        with self.assertRaises(AssertionError):prepare_fresh_identity(Path('chillywood-local-auth-'+'c'*32),'c'*32)
        with tempfile.TemporaryDirectory() as temporary:
            parent=Path(temporary).resolve();real=parent/'real';real.mkdir();alias=parent/'alias';alias.symlink_to(real,target_is_directory=True)
            with self.assertRaises(AssertionError):prepare_fresh_identity(alias/('chillywood-local-auth-'+'c'*32),'c'*32)
            self.assertEqual(list(real.iterdir()),[])

    def test_cleanup_and_new_run_identity_are_mutually_exclusive_before_docker(self):
        with self.assertRaises(AssertionError):Stack(cleanup_path='/tmp/unknown',evidence_root='/tmp/new',run_id='d'*32)

if __name__=='__main__':unittest.main()
