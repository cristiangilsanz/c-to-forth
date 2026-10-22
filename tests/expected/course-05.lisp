(setq a 0)
(setq b 5)
(setq c 2)
(setq d 0)
(setq e 0)

(defun my_func ()
  (let* ((f 5))
    (loop while (/= e f) do
      (format t "The value of e is:~%")
      (format t "~d" e)
      (incf e))
    e))

(defun main ()
  (format t "Hello world!~%")
  (setf a b)
  (setf d (truncate (* b c) 10))
  (format t "~d" d)
  (my_func)
  (when (= e b) (format t "Variable 'e' equals 'b'~%")))

(main)
